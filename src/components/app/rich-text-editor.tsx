"use client";

import { useRef, useState, useEffect } from "react";
import { PLACEHOLDER_HELP_ITEMS } from "@/components/app/placeholder-help";

/**
 * Lightweight rich text editor with a formatting toolbar.
 * Stores HTML in a hidden textarea for form submission.
 *
 * Toolbar buttons:
 * - Bold, Italic, Underline, Strikethrough
 * - Heading 1, Heading 2, normal text
 * - Align left, center, right (justify)
 * - Bullet list, numbered list
 * - Quote, horizontal rule
 * - Text color, highlight color
 * - Insert link, insert image, remove link
 * - Clear formatting, undo, redo
 */
export function RichTextEditor({
  name,
  defaultValue,
  placeholder,
  rows = 6,
  onChange,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  onChange?: (html: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [html, setHtml] = useState(defaultValue ?? "");
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);

  // Sync editor content from defaultValue — but never while the user is
  // typing. Re-assigning innerHTML destroys the DOM selection and collapses
  // the caret to position 0, which makes new characters appear *before*
  // already-typed text. Only apply external changes when unfocused.
  useEffect(() => {
    const el = editorRef.current;
    if (
      el &&
      defaultValue !== undefined &&
      document.activeElement !== el &&
      el.innerHTML !== defaultValue
    ) {
      el.innerHTML = defaultValue;
    }
  }, [defaultValue]);

  function exec(command: string, value?: string) {
    document.execCommand(command, false, value);
    syncHtml();
    editorRef.current?.focus();
  }

  /** Keep the stored caret fresh as the user moves through the editor. */
  function captureCaret() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      if (editorRef.current?.contains(r.commonAncestorContainer)) {
        savedRange.current = r.cloneRange();
      }
    }
  }

  /** Capture the caret/selection before a modal steals focus. */
  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      if (editorRef.current?.contains(r.commonAncestorContainer)) {
        savedRange.current = r.cloneRange();
        return;
      }
    }
    savedRange.current = null;
  }

  /** Put the caret back where it was — or at the end of the content. */
  function restoreSelection() {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    const r = savedRange.current;
    savedRange.current = null;
    sel?.removeAllRanges();
    if (r && el.contains(r.commonAncestorContainer)) {
      sel?.addRange(r);
    } else {
      const end = document.createRange();
      end.selectNodeContents(el);
      end.collapse(false);
      sel?.addRange(end);
    }
  }

  function syncHtml() {
    if (editorRef.current) {
      const newHtml = editorRef.current.innerHTML;
      setHtml(newHtml);
      onChange?.(newHtml);
    }
  }

  function handleLink() {
    saveSelection();
    setLinkText(savedRange.current?.toString() ?? "");
    setLinkUrl("");
    setShowLinkModal(true);
  }

  function confirmLink() {
    const url = linkUrl.trim();
    if (!url) {
      setShowLinkModal(false);
      return;
    }
    restoreSelection();
    const displayText = linkText.trim() || url;
    const linkHtml = `<a href="${escapeAttr(url)}" style="color: #B23A2E; text-decoration: underline;">${escapeHtml(displayText)}</a>`;
    document.execCommand("insertHTML", false, linkHtml);
    syncHtml();
    setShowLinkModal(false);
  }

  /** Insert a {{variable}} token where the caret last was. */
  function insertToken(token: string) {
    restoreSelection();
    document.execCommand("insertText", false, token);
    syncHtml();
  }

  function handleImage() {
    saveSelection();
    setImageUrl("");
    setImageAlt("");
    setImageError(null);
    setImageUploading(false);
    setShowImageModal(true);
  }

  /** Upload a picked image file, then insert it at the saved caret. */
  async function uploadImage(file: File) {
    if (!file.type.startsWith("image/")) {
      setImageError("That's not an image file — pick a PNG, JPG, GIF or WebP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImageError("Images should stay under 10 MB for email deliverability.");
      return;
    }
    setImageError(null);
    setImageUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/documents/upload-file", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      const { publicUrl } = await res.json();
      if (!publicUrl) {
        throw new Error("Uploaded, but your file storage has no public URL — paste a public https:// image link instead.");
      }
      restoreSelection();
      const imgHtml = `<img src="${escapeAttr(publicUrl)}" alt="${escapeAttr(imageAlt || file.name)}" style="max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0;" />`;
      document.execCommand("insertHTML", false, imgHtml);
      syncHtml();
      setShowImageModal(false);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setImageUploading(false);
      if (imageFileRef.current) imageFileRef.current.value = "";
    }
  }

  function confirmImage() {
    const url = imageUrl.trim();
    if (!url) {
      setShowImageModal(false);
      return;
    }
    restoreSelection();
    const altText = imageAlt || "Image";
    const imgHtml = `<img src="${escapeAttr(url)}" alt="${escapeAttr(altText)}" style="max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0;" />`;
    document.execCommand("insertHTML", false, imgHtml);
    syncHtml();
    setShowImageModal(false);
  }

  const btnClass = "w-8 h-8 min-h-[36px] min-w-[36px] flex items-center justify-center rounded hover:bg-paper-2 text-sm font-semibold border border-transparent hover:border-rule transition-colors";

  return (
    <div className="border border-rule rounded bg-paper overflow-hidden">
      {/* Toolbar — preventDefault on mousedown keeps the editor selection */}
      <div
        className="flex items-center gap-0.5 flex-wrap border-b border-rule bg-panel px-1.5 py-1"
        onMouseDown={(e) => {
          // Buttons must not steal the caret — but the select needs its mousedown to open.
          if ((e.target as HTMLElement).tagName !== "SELECT") e.preventDefault();
        }}
      >
        <button type="button" onClick={() => exec("bold")} className={btnClass} title="Bold" aria-label="Bold">
          <strong>B</strong>
        </button>
        <button type="button" onClick={() => exec("italic")} className={btnClass} title="Italic" aria-label="Italic">
          <em>I</em>
        </button>
        <button type="button" onClick={() => exec("underline")} className={btnClass} title="Underline" aria-label="Underline">
          <u>U</u>
        </button>
        <button type="button" onClick={() => exec("strikeThrough")} className={btnClass} title="Strikethrough" aria-label="Strikethrough">
          <s>S</s>
        </button>

        <span className="w-px h-5 bg-rule mx-1" />

        <button type="button" onClick={() => exec("formatBlock", "h1")} className={`${btnClass} text-[11px]`} title="Heading 1" aria-label="Heading 1">
          H1
        </button>
        <button type="button" onClick={() => exec("formatBlock", "h2")} className={`${btnClass} text-[11px]`} title="Heading 2" aria-label="Heading 2">
          H2
        </button>
        <button type="button" onClick={() => exec("formatBlock", "p")} className={btnClass} title="Normal text" aria-label="Normal text">
          ¶
        </button>

        <span className="w-px h-5 bg-rule mx-1" />

        <button type="button" onClick={() => exec("justifyLeft")} className={btnClass} title="Align left" aria-label="Align left">
          ⬅
        </button>
        <button type="button" onClick={() => exec("justifyCenter")} className={btnClass} title="Align center" aria-label="Align center">
          ↔
        </button>
        <button type="button" onClick={() => exec("justifyRight")} className={btnClass} title="Align right" aria-label="Align right">
          ➡
        </button>

        <span className="w-px h-5 bg-rule mx-1" />

        <button type="button" onClick={() => exec("insertUnorderedList")} className={btnClass} title="Bullet list" aria-label="Bullet list">
          •
        </button>
        <button type="button" onClick={() => exec("insertOrderedList")} className={btnClass} title="Numbered list" aria-label="Numbered list">
          1.
        </button>
        <button type="button" onClick={() => exec("formatBlock", "blockquote")} className={btnClass} title="Quote" aria-label="Quote">
          ❝
        </button>
        <button type="button" onClick={() => exec("insertHorizontalRule")} className={btnClass} title="Horizontal rule" aria-label="Horizontal rule">
          ―
        </button>

        <span className="w-px h-5 bg-rule mx-1" />

        {/* Text color + highlight — color inputs styled as toolbar buttons */}
        <label className={`${btnClass} relative cursor-pointer`} title="Text color" aria-label="Text color">
          <span className="border-b-2 border-ink">A</span>
          <input
            type="color"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => exec("foreColor", e.currentTarget.value)}
          />
        </label>
        <label className={`${btnClass} relative cursor-pointer`} title="Highlight color" aria-label="Highlight color">
          <span className="bg-amber-200 px-0.5 rounded-sm">A</span>
          <input
            type="color"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => exec("hiliteColor", e.currentTarget.value)}
          />
        </label>

        <span className="w-px h-5 bg-rule mx-1" />

        <button type="button" onClick={handleLink} className={btnClass} title="Insert link" aria-label="Insert link">
          🔗
        </button>
        <button type="button" onClick={handleImage} className={btnClass} title="Insert image" aria-label="Insert image">
          🖼
        </button>
        <button type="button" onClick={() => exec("unlink")} className={btnClass} title="Remove link" aria-label="Remove link">
          ⛓‍💥
        </button>

        <span className="w-px h-5 bg-rule mx-1" />

        <button type="button" onClick={() => exec("removeFormat")} className={btnClass} title="Clear formatting" aria-label="Clear formatting">
          ⨯
        </button>
        <button type="button" onClick={() => exec("undo")} className={btnClass} title="Undo" aria-label="Undo">
          ↶
        </button>
        <button type="button" onClick={() => exec("redo")} className={btnClass} title="Redo" aria-label="Redo">
          ↷
        </button>

        <span className="w-px h-5 bg-rule mx-1" />

        {/* Variable inserter — tokens are replaced with lead data at send time */}
        <select
          className="text-xs bg-panel border border-rule rounded px-1.5 min-h-[36px] font-mono cursor-pointer"
          value=""
          onChange={(e) => {
            const t = e.currentTarget.value;
            if (t) insertToken(t);
            e.currentTarget.value = "";
          }}
          aria-label="Insert variable"
          title="Insert variable — replaced with the lead's details when sent"
        >
          <option value="" disabled>
            {"{{…}}"} Field
          </option>
          {PLACEHOLDER_HELP_ITEMS.map((p) => (
            <option key={p.token} value={p.token}>
              {p.token}
            </option>
          ))}
        </select>
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={syncHtml}
        onBlur={syncHtml}
        onKeyUp={captureCaret}
        onMouseUp={captureCaret}
        onFocus={captureCaret}
        className="px-3 py-2.5 text-sm min-h-[120px] focus:outline-none prose prose-sm max-w-none"
        style={{ minHeight: `${rows * 24}px` }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />

      {/* Hidden textarea for form submission */}
      <textarea name={name} value={html} readOnly hidden />

      {/* Link modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-ink/30 flex items-center justify-center z-50 p-4" onClick={() => setShowLinkModal(false)}>
          <div className="bg-paper border border-rule rounded-lg p-4 max-w-sm w-full shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-sm mb-3">Insert link</h3>
            <div className="space-y-2">
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); confirmLink(); }
                  else if (e.key === "Escape") setShowLinkModal(false);
                }}
                placeholder="https://example.com"
                className="w-full text-sm border border-rule rounded px-3 py-2 min-h-[40px]"
                autoFocus
              />
              <input
                type="text"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); confirmLink(); }
                  else if (e.key === "Escape") setShowLinkModal(false);
                }}
                placeholder="Link text (optional)"
                className="w-full text-sm border border-rule rounded px-3 py-2 min-h-[40px]"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowLinkModal(false)} className="text-sm px-3 py-1.5 min-h-[36px] border border-rule rounded hover:bg-paper-2">
                  Cancel
                </button>
                <button type="button" onClick={confirmLink} className="text-sm font-semibold px-3 py-1.5 min-h-[36px] bg-ink text-paper rounded hover:bg-ink/90">
                  Insert
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image modal */}
      {showImageModal && (
        <div className="fixed inset-0 bg-ink/30 flex items-center justify-center z-50 p-4" onClick={() => setShowImageModal(false)}>
          <div className="bg-paper border border-rule rounded-lg p-4 max-w-sm w-full shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-sm mb-3">Insert image</h3>
            <div className="space-y-2">
              <input
                ref={imageFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImage(f);
                }}
              />
              <button
                type="button"
                onClick={() => imageFileRef.current?.click()}
                disabled={imageUploading}
                className="w-full text-sm font-semibold px-3 py-2 min-h-[40px] bg-panel border border-rule rounded hover:bg-paper-2 disabled:opacity-50"
              >
                {imageUploading ? "Uploading…" : "↑ Upload from device"}
              </button>
              <div className="flex items-center gap-2 text-[11px] text-ink-soft">
                <span className="flex-1 border-t border-dashed border-rule" />
                or paste an image URL
                <span className="flex-1 border-t border-dashed border-rule" />
              </div>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); confirmImage(); }
                  else if (e.key === "Escape") setShowImageModal(false);
                }}
                placeholder="https://example.com/image.png"
                className="w-full text-sm border border-rule rounded px-3 py-2 min-h-[40px]"
                autoFocus
              />
              <input
                type="text"
                value={imageAlt}
                onChange={(e) => setImageAlt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); confirmImage(); }
                  else if (e.key === "Escape") setShowImageModal(false);
                }}
                placeholder="Alt text (optional)"
                className="w-full text-sm border border-rule rounded px-3 py-2 min-h-[40px]"
              />
              {imageError && <p className="text-xs text-stamp">{imageError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowImageModal(false)} className="text-sm px-3 py-1.5 min-h-[36px] border border-rule rounded hover:bg-paper-2">
                  Cancel
                </button>
                <button type="button" onClick={confirmImage} disabled={imageUploading} className="text-sm font-semibold px-3 py-1.5 min-h-[36px] bg-ink text-paper rounded hover:bg-ink/90 disabled:opacity-50">
                  Insert
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
