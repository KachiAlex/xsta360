import { describe, it, expect } from "vitest";
import {
  replacePlaceholders,
  markdownToHtml,
  buildEmailHtml,
  formatWhatsAppMessage,
} from "@/lib/message-format";

describe("replacePlaceholders", () => {
  const ctx = {
    leadName: "Tunde Adeyemi",
    leadCompany: "Kreatix",
    leadPhone: "+234 803 123 4567",
    leadEmail: "tunde@kreatix.com",
    repName: "Sarah Johnson",
    orgName: "Xsta360",
  };

  it("replaces {{lead_name}}", () => {
    expect(replacePlaceholders("Hello {{lead_name}}", ctx)).toBe("Hello Tunde Adeyemi");
  });

  it("replaces {{first_name}} with first word of lead name", () => {
    expect(replacePlaceholders("Hi {{first_name}}", ctx)).toBe("Hi Tunde");
  });

  it("replaces {{lead_company}}", () => {
    expect(replacePlaceholders("From {{lead_company}}", ctx)).toBe("From Kreatix");
  });

  it("replaces {{lead_phone}}", () => {
    expect(replacePlaceholders("Call {{lead_phone}}", ctx)).toBe("Call +234 803 123 4567");
  });

  it("replaces {{lead_email}}", () => {
    expect(replacePlaceholders("Email {{lead_email}}", ctx)).toBe("Email tunde@kreatix.com");
  });

  it("replaces {{rep_name}}", () => {
    expect(replacePlaceholders("This is {{rep_name}}", ctx)).toBe("This is Sarah Johnson");
  });

  it("replaces {{org_name}}", () => {
    expect(replacePlaceholders("From {{org_name}}", ctx)).toBe("From Xsta360");
  });

  it("replaces multiple placeholders in one string", () => {
    const text = "Hi {{first_name}}, this is {{rep_name}} from {{org_name}}";
    expect(replacePlaceholders(text, ctx)).toBe("Hi Tunde, this is Sarah Johnson from Xsta360");
  });

  it("leaves unknown placeholders unchanged", () => {
    expect(replacePlaceholders("Hello {{unknown_var}}", ctx)).toBe("Hello {{unknown_var}}");
  });

  it("handles null repName with fallback", () => {
    const ctxNoRep = { ...ctx, repName: null };
    expect(replacePlaceholders("This is {{rep_name}}", ctxNoRep)).toBe("This is our team");
  });

  it("handles null leadCompany with empty string", () => {
    const ctxNoCompany = { ...ctx, leadCompany: null };
    expect(replacePlaceholders("From {{lead_company}}", ctxNoCompany)).toBe("From ");
  });

  it("handles empty lead name with fallback", () => {
    const ctxEmptyName = { ...ctx, leadName: "" };
    expect(replacePlaceholders("Hi {{lead_name}}", ctxEmptyName)).toBe("Hi there");
  });
});

describe("markdownToHtml", () => {
  it("converts **bold** to <strong>", () => {
    expect(markdownToHtml("**hello**")).toBe("<strong>hello</strong>");
  });

  it("converts *italic* to <em>", () => {
    expect(markdownToHtml("*hello*")).toBe("<em>hello</em>");
  });

  it("does not confuse * with **", () => {
    expect(markdownToHtml("**bold** and *italic*")).toBe("<strong>bold</strong> and <em>italic</em>");
  });

  it("converts [text](url) to anchor tag", () => {
    const result = markdownToHtml("[link](https://example.com)");
    expect(result).toContain('<a href="https://example.com"');
    expect(result).toContain(">link</a>");
  });

  it("converts line breaks to <br>", () => {
    expect(markdownToHtml("line1\nline2")).toBe("line1<br>line2");
  });

  it("escapes HTML entities", () => {
    expect(markdownToHtml("<script>alert('x')</script>")).toBe(
      "&lt;script&gt;alert('x')&lt;/script&gt;",
    );
  });

  it("handles plain text without markdown", () => {
    expect(markdownToHtml("just plain text")).toBe("just plain text");
  });

  it("handles combined formatting", () => {
    const result = markdownToHtml("**Bold** and [link](https://x.com) and *italic*");
    expect(result).toContain("<strong>Bold</strong>");
    expect(result).toContain('<a href="https://x.com"');
    expect(result).toContain("<em>italic</em>");
  });
});

describe("buildEmailHtml", () => {
  it("wraps content in styled HTML div", () => {
    const html = buildEmailHtml("Hello world", "Xsta360");
    expect(html).toContain("Hello world");
    expect(html).toContain("Xsta360");
    expect(html).toContain("font-family");
  });

  it("converts markdown in body", () => {
    const html = buildEmailHtml("**Bold text**", "Org");
    expect(html).toContain("<strong>Bold text</strong>");
  });
});

describe("formatWhatsAppMessage", () => {
  it("appends org name signature", () => {
    const result = formatWhatsAppMessage("Hello there", "Xsta360");
    expect(result).toBe("Hello there\n\n— Xsta360");
  });

  it("preserves WhatsApp-native markdown", () => {
    const result = formatWhatsAppMessage("*Bold* _italic_ ~strike~", "Org");
    expect(result).toContain("*Bold*");
    expect(result).toContain("_italic_");
    expect(result).toContain("~strike~");
  });
});
