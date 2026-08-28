import Link from "next/link";

const FEATURES = [
  { tag: "Lead management", title: "Capture from anywhere", body: "Manual entry, CSV import, or an embeddable web form that drops leads straight into your pipeline — tagged and ready." },
  { tag: "Remarks", title: "The full story, every time", body: "Every call, objection, and next step logged against the lead — so anyone on the team can pick up where you left off." },
  { tag: "Reminders", title: "A dashboard that nags nicely", body: "Set a follow-up in one tap. Get flagged the moment a lead has gone quiet longer than it should." },
  { tag: "Attribution", title: "Know what's actually working", body: "Every lead carries its source. See conversion by channel, not just raw lead counts." },
  { tag: "Pipeline", title: "A board that matches how you sell", body: "Custom stages, drag-and-drop movement, and a clear reason logged every time a deal is lost." },
  { tag: "Manager view", title: "Visibility, not micromanagement", body: "See who's on top of their follow-ups and who needs support — without asking for a status update." },
];

export default function Home() {
  return (
    <>
      {/* NAV */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-5 sm:px-12 py-4 sm:py-5 bg-paper/92 backdrop-blur-[6px] border-b border-rule">
        <div className="logo font-mono font-bold text-lg sm:text-xl flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-stamp shadow-[0_0_0_3px_rgba(178,58,46,0.15)]" />
          XSTA360
        </div>
        <div className="nav-links flex gap-3 sm:gap-8 items-center text-sm">
          <a href="#features" className="no-underline text-ink-soft font-medium hover:text-ink hidden sm:inline">Features</a>
          <a href="#how" className="no-underline text-ink-soft font-medium hover:text-ink hidden sm:inline">How it works</a>
          <Link href="/login" className="btn btn-ghost inline-block font-semibold text-sm px-3 sm:px-5 py-2 sm:py-2.5 rounded-[3px] border-[1.5px] border-ink bg-transparent text-ink hover:bg-paper-2">Sign in</Link>
          <Link href="/signup" className="btn btn-primary inline-block font-semibold text-sm px-3 sm:px-5 py-2 sm:py-2.5 rounded-[3px] border-[1.5px] border-ink bg-ink text-paper hover:bg-stamp-deep hover:border-stamp-deep">Start free</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero ledger-lines relative pt-12 sm:pt-24 px-5 sm:px-12 pb-12 sm:pb-16 max-w-[1180px] mx-auto">
        <div className="eyebrow font-mono text-[12px] sm:text-[13px] tracking-wider text-stamp uppercase font-semibold flex items-center gap-2.5 mb-[22px]">
          <span className="w-6 h-px bg-stamp" />
          Your complete sales management hub
        </div>
        <h1 className="font-mono text-[clamp(34px,9vw,76px)] leading-[1.02] font-bold m-0 mb-5 sm:mb-7 tracking-tight">
          <span className="block text-ink">Manage.</span>
          <span className="block text-ink-soft">Follow Up.</span>
          <span className="block text-register">Close.</span>
        </h1>
        <p className="hero-sub text-base sm:text-[19px] text-ink-soft max-w-[560px] m-0 mb-8 sm:mb-10">
          Deals don&apos;t die from rejection. They die from silence. Xsta360 makes sure no lead ever goes cold on your watch — from first contact to closed-won.
        </p>
        <div className="hero-ctas flex gap-3 sm:gap-4 mb-12 sm:mb-[72px] flex-wrap">
          <Link href="/signup" className="btn btn-primary inline-block font-semibold text-sm sm:text-[15px] px-5 sm:px-[26px] py-3 sm:py-3.5 rounded-[3px] border-[1.5px] border-ink bg-ink text-paper hover:bg-stamp-deep hover:border-stamp-deep">Start free — no card needed</Link>
          <a href="#how" className="btn btn-ghost inline-block font-semibold text-sm sm:text-[15px] px-5 sm:px-[26px] py-3 sm:py-3.5 rounded-[3px] border-[1.5px] border-ink bg-transparent text-ink hover:bg-paper-2">See how it works</a>
        </div>

        {/* Receipt card */}
        <div className="receipt-wrap flex justify-center mb-6">
          <div className="receipt w-full max-w-[460px] bg-[#FBF9F2] border border-rule shadow-[0_18px_40px_-20px_rgba(30,42,34,0.35),0_2px_0_var(--color-rule)] p-5 sm:p-7 font-mono relative receipt-edge-top receipt-edge-bottom">
            <div className="receipt-title text-[11px] tracking-wider uppercase text-ink-soft mb-1.5 font-semibold">
              Today&apos;s follow-ups — Aug 25
            </div>
            <div className="receipt-row flex justify-between items-center py-2.5 border-b border-dashed border-rule text-[12px] sm:text-[13.5px]">
              <span className="truncate pr-2"><span className="inline-block w-[9px] h-[9px] rounded-full mr-2 bg-stamp shadow-[0_0_0_4px_rgba(178,58,46,0.16)]" />Adaeze Okonkwo — Lagos Freight Co.</span>
              <span className="shrink-0">2:00 PM</span>
            </div>
            <div className="receipt-row flex justify-between items-center py-2.5 border-b border-dashed border-rule text-[12px] sm:text-[13.5px]">
              <span className="truncate pr-2"><span className="inline-block w-[9px] h-[9px] rounded-full mr-2 bg-amber shadow-[0_0_0_4px_rgba(217,138,43,0.16)]" />Tunde Bakare — Zenith Retail</span>
              <span className="shrink-0">4:30 PM</span>
            </div>
            <div className="receipt-row flex justify-between items-center py-2.5 border-b border-dashed border-rule text-[12px] sm:text-[13.5px]">
              <span className="truncate pr-2"><span className="inline-block w-[9px] h-[9px] rounded-full mr-2 bg-cold" />Ngozi Eze — Coastal Traders</span>
              <span className="shrink-0">Overdue</span>
            </div>
            <div className="receipt-row flex justify-between items-center py-2.5 text-[12px] sm:text-[13.5px]">
              <span className="truncate pr-2"><span className="inline-block w-[9px] h-[9px] rounded-full mr-2 bg-stamp shadow-[0_0_0_4px_rgba(178,58,46,0.16)]" />Femi Adeyemi — Bright Homes Ltd.</span>
              <span className="shrink-0">5:15 PM</span>
            </div>
            <div className="stamp absolute right-[22px] bottom-[30px] font-mono font-bold text-[13px] sm:text-[15px] text-register border-[2.5px] border-register px-3 py-1.5 rounded tracking-wider">
              FOLLOWED UP
            </div>
          </div>
        </div>
      </section>

      {/* STEPS */}
      <div className="steps max-w-[1180px] mx-auto px-5 sm:px-12 pt-10 pb-12 sm:pb-[100px] grid grid-cols-1 sm:grid-cols-3 gap-0 border-t border-rule">
        <div className="step-card px-5 sm:px-8 py-8 sm:py-10 sm:border-r border-rule border-b sm:border-b-0">
          <div className="step-num font-mono text-[13px] text-ink-soft mb-[18px] tracking-wider">01 — Manage</div>
          <h3 className="font-mono text-[20px] sm:text-[22px] m-0 mb-3">Every lead, one ledger</h3>
          <p className="text-ink-soft text-[15px] m-0">Capture leads manually, import in bulk, or pull them straight from your marketing forms. Tag each one by source so you know exactly where your pipeline is coming from.</p>
        </div>
        <div className="step-card px-5 sm:px-8 py-8 sm:py-10 sm:border-r border-rule border-b sm:border-b-0">
          <div className="step-num font-mono text-[13px] text-ink-soft mb-[18px] tracking-wider">02 — Follow Up</div>
          <h3 className="font-mono text-[20px] sm:text-[22px] m-0 mb-3">Never let it go cold</h3>
          <p className="text-ink-soft text-[15px] m-0">Log a remark, set a reminder, done. Your &quot;Today&apos;s Follow-Ups&quot; list tells you exactly who to call — and flags anyone you&apos;ve let slip.</p>
        </div>
        <div className="step-card px-5 sm:px-8 py-8 sm:py-10">
          <div className="step-num font-mono text-[13px] text-ink-soft mb-[18px] tracking-wider">03 — Close</div>
          <h3 className="font-mono text-[20px] sm:text-[22px] m-0 mb-3">Track the win, learn the loss</h3>
          <p className="text-ink-soft text-[15px] m-0">Move deals through your pipeline, record why you won or lost, and see it all rolled up — by rep, by source, by stage.</p>
        </div>
      </div>

      {/* FEATURES */}
      <section className="section max-w-[1180px] mx-auto px-5 sm:px-12 pb-12 sm:pb-[100px]" id="features">
        <div className="section-head max-w-[620px] mb-8 sm:mb-12">
          <div className="eyebrow font-mono text-[13px] tracking-wider text-stamp uppercase font-semibold flex items-center gap-2.5 mb-3.5">
            <span className="w-6 h-px bg-stamp" />
            Built for the whole funnel
          </div>
          <h2 className="font-mono text-[clamp(24px,4vw,36px)] m-0 mb-3.5">One hub. Sales and marketing, on the same page.</h2>
          <p className="text-ink-soft text-base m-0">Marketing generates the lead. Sales works the follow-up. Xsta360 keeps both sides looking at the same record instead of guessing what happened after the handoff.</p>
        </div>
        <div className="feature-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-rule border border-rule">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature bg-paper px-5 sm:px-7 py-6 sm:py-[30px]">
              <span className="tag font-mono text-[11px] text-stamp uppercase tracking-wider mb-3 block">{f.tag}</span>
              <h4 className="text-[17px] m-0 mb-2.5">{f.title}</h4>
              <p className="m-0 text-ink-soft text-[14.5px]">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CONTEXT STRIP */}
      <section className="context bg-ink text-paper py-12 sm:py-16 px-5 sm:px-12">
        <div className="context-inner max-w-[1180px] mx-auto flex gap-6 sm:gap-12 items-center flex-wrap">
          <div className="flex-1 min-w-[280px]">
            <div className="eyebrow font-mono text-[13px] tracking-wider text-amber uppercase font-semibold flex items-center gap-2.5 mb-3.5">
              <span className="w-6 h-px bg-amber" />
              Built for how sales actually happens
            </div>
            <h2 className="font-mono text-[clamp(20px,3vw,30px)] max-w-[480px] m-0 leading-[1.25]">
              Most of your pipeline already lives in WhatsApp. We&apos;re not pretending otherwise.
            </h2>
          </div>
          <p className="text-[#C9CFC7] max-w-[420px] text-[15px] m-0">
            Xsta360 is built around the tools your team already uses to close deals — not a rigid system that asks you to change how you sell.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-band py-16 sm:py-[90px] px-5 sm:px-12 text-center border-t border-rule" id="how">
        <h2 className="font-mono text-[clamp(26px,5vw,44px)] m-0 mb-5">Stop losing deals to silence.</h2>
        <p className="text-ink-soft text-base m-0 mb-[34px]">Set up your first pipeline in under five minutes.</p>
        <Link href="/signup" className="btn btn-primary inline-block font-semibold text-[15px] px-[26px] py-3.5 rounded-[3px] border-[1.5px] border-ink bg-ink text-paper hover:bg-stamp-deep hover:border-stamp-deep">Start free — no card needed</Link>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-rule px-5 sm:px-12 py-8 flex justify-between items-center text-[13px] text-ink-soft font-mono flex-wrap gap-3">
        <span>© 2026 XSTA360</span>
        <span>MANAGE.&nbsp;&nbsp;FOLLOW UP.&nbsp;&nbsp;CLOSE.</span>
      </footer>
    </>
  );
}
