"use client";

import { useRef, useState, useEffect } from "react";

/**
 * Lightweight rich text editor with a formatting toolbar.
 * Stores HTML in a hidden textarea for form submission.
 *
 * Toolbar buttons:
 * - Bold, Italic, Underline
 * - Align left, center, right (justify)
 * - Bullet list, numbered list
 * - Insert link, insert image
 * - Clear formatting
 */
export function RichTextEditor({
  name,
  defaultValue,
  placeholder,
  rows = 6,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const linkModalRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(defaultValue ?? "");
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");

  // Sync editor content on mount.
  useEffect(() => {
    if (editorRef.current && defaultValue) {
      editorRef.current.innerHTML = defaultValue;
    }
  }, [defaultValue]);

  function exec(command: string, value?: string) {
    document.execCommand(command, false, value);
    syncHtml();
    editorRef.current?.focus();
  }

  function syncHtml() {
    if (editorRef.current) {
      setHtml(editorRef.current.innerHTML);
    }
  }

  function handleLink() {
    const selection = window.getSelection();
    const selectedText = selection?.toString() ?? "";
    setLinkText(selectedText);
    setLinkUrl("");
    setShowLinkModal(true);
  }

  function confirmLink() {
    if (!linkUrl) {
      setShowLinkModal(false);
      return;
    }
    editorRef.current?.focus();
    // Restore selection
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && linkText) {
      // If there was selected text, use it; otherwise insert the URL as text
    }
    const displayText = linkText || linkUrl;
    const linkHtml = `<a href="${escapeAttr(linkUrl)}" style="color: #B23A2E; text-decoration: underline;">${escapeHtml(displayText)}</a>`;

    if (linkText) {
      document.execCommand("insertHTML", false, linkHtml);
    } else {
      document.execCommand("insertHTML", false, linkHtml);
    }
    syncHtml();
    setShowLinkModal(false);
  }

  function handleImage() {
    setImageUrl("");
    setImageAlt("");
    setShowImageModal(true);
  }

  function confirmImage() {
    if (!imageUrl) {
      setShowImageModal(false);
      return;
    }
    const altText = imageAlt || "Image";
    const imgHtml = `<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(altText)}" style="max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0;" />`;
    document.execCommand("insertHTML", false, imgHtml);
    syncHtml();
    setShowImageModal(false);
  }

  const btnClass = "w-8 h-8 min-h-[36px] min-w-[36px] flex items-center justify-center rounded hover:bg-paper-2 text-sm font-semibold border border-transparent hover:border-rule transition-colors";

  return (
    <div className="border border-rule rounded bg-paper overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 flex-wrap border-b border-rule bg-panel px-1.5 py-1">
        <button type="button" onClick={() => exec("bold")} className={btnClass} title="Bold" aria-label="Bold">
          <strong>B</strong>
        </button>
        <button type="button" onClick={() => exec("italic")} className={btnClass} title="Italic" aria-label="Italic">
          <em>I</em>
        </button>
        <button type="button" onClick={() => exec("underline")} className={btnClass} title="Underline" aria-label="Underline">
          <u>U</u>
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

        <span className="w-px h-5 bg-rule mx-1" />

        <button type="button" onClick={handleLink} className={btnClass} title="Insert link" aria-label="Insert link">
          🔗
        </button>
        <button type="button" onClick={handleImage} className={btnClass} title="Insert image" aria-label="Insert image">
          🖼
        </button>

        <span className="w-px h-5 bg-rule mx-1" />

        <button type="button" onClick={() => exec("removeFormat")} className={btnClass} title="Clear formatting" aria-label="Clear formatting">
          ⨯
        </button>
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={syncHtml}
        onBlur={syncHtml}
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
                placeholder="https://example.com"
                className="w-full text-sm border border-rule rounded px-3 py-2 min-h-[40px]"
                autoFocus
              />
              <input
                type="text"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
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
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                className="w-full text-sm border border-rule rounded px-3 py-2 min-h-[40px]"
                autoFocus
              />
              <input
                type="text"
                value={imageAlt}
                onChange={(e) => setImageAlt(e.target.value)}
                placeholder="Alt text (optional)"
                className="w-full text-sm border border-rule rounded px-3 py-2 min-h-[40px]"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowImageModal(false)} className="text-sm px-3 py-1.5 min-h-[36px] border border-rule rounded hover:bg-paper-2">
                  Cancel
                </button>
                <button type="button" onClick={confirmImage} className="text-sm font-semibold px-3 py-1.5 min-h-[36px] bg-ink text-paper rounded hover:bg-ink/90">
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
