<?php
/**
 * Plugin Name:       Xsta360 WooCommerce Connector
 * Description:       Sends order notifications through Xsta360 (email + WhatsApp) on order events.
 * Version:           0.1.0
 * Requires Plugins:  woocommerce
 * License:           MIT
 *
 * Configure in wp-config.php or Settings → Code Snippets:
 *   define('XSTA360_API_URL', 'https://your-xsta360-host');
 *   define('XSTA360_API_KEY', 'xsta_live_...');
 *   define('XSTA360_WA_TEMPLATE', 'order_confirmation'); // approved UTILITY template (optional)
 *
 * IMPORTANT: only enable WhatsApp sends for customers who opted in at
 * checkout (this plugin attaches opt-in evidence collected at checkout).
 */

if (!defined('ABSPATH')) exit;

function xsta360_api_call($path, $body, $idempotency_key) {
    $api_url = defined('XSTA360_API_URL') ? XSTA360_API_URL : '';
    $api_key = defined('XSTA360_API_KEY') ? XSTA360_API_KEY : '';
    if (!$api_url || !$api_key) return;

    wp_remote_post(trailingslashit($api_url) . 'api/v1/' . ltrim($path, '/'), [
        'timeout' => 15,
        'headers' => [
            'Authorization'   => 'Bearer ' . $api_key,
            'Content-Type'    => 'application/json',
            'Idempotency-Key' => $idempotency_key,
        ],
        'body' => wp_json_encode($body),
    ]);
}

add_action('woocommerce_checkout_update_order_meta', function ($order_id) {
    // Record WhatsApp opt-in if your theme/plugin collects a consent checkbox.
    // Adjust the meta key to whatever your checkout field is called.
    $order = wc_get_order($order_id);
    if ($order && !empty($_POST['whatsapp_optin'])) { // phpcs:ignore
        $order->update_meta_data('_whatsapp_optin', 'yes');
        $order->save();
    }
});

add_action('woocommerce_new_order', function ($order_id) {
    $order = wc_get_order($order_id);
    if (!$order) return;

    $first = $order->get_billing_first_name();
    $email = $order->get_billing_email();
    $phone = $order->get_billing_phone();
    $opted_in = $order->get_meta('_whatsapp_optin') === 'yes';

    // 1. Upsert the contact (with opt-in evidence if collected).
    $contact = [
        'name'    => trim("$first " . $order->get_billing_last_name()),
        'email'   => $email,
        'phone'   => $phone,
        'company' => $order->get_billing_company(),
    ];
    if ($opted_in) {
        $contact['optIn'] = ['whatsapp' => ['source' => 'woocommerce_checkout']];
    }
    xsta360_api_call('contacts', $contact, "wc-order-{$order_id}-contact");

    // 2. Email order confirmation (Xsta360 sends it; Woo's own email can be
    //    disabled for the event if you don't want both).
    xsta360_api_call('messages/email', [
        'to'      => $email,
        'subject' => "Order #{$order->get_order_number()} confirmed",
        'text'    => "Hi {$first}, thanks for your order of {$order->get_formatted_order_total()}. We'll update you as it progresses.",
        'consent' => true,
    ], "wc-order-{$order_id}-email");

    // 3. WhatsApp confirmation — UTILITY template, only for opt-ins.
    if ($opted_in && defined('XSTA360_WA_TEMPLATE') && XSTA360_WA_TEMPLATE) {
        xsta360_api_call('messages/whatsapp', [
            'to'       => $phone,
            'type'     => 'template',
            'template' => XSTA360_WA_TEMPLATE,
            'params'   => [(string) $order->get_order_number(), wp_strip_all_tags($order->get_formatted_order_total())],
            'consent'  => true,
        ], "wc-order-{$order_id}-wa");
    }
}, 20);
