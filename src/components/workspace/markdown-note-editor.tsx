"use client";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import type { Editor } from "@tiptap/core";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";

type MarkdownNoteEditorProps = {
  initialValue: string;
  onChange: (markdown: string) => void;
};

type EditorButtonProps = {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
};

type FormattingState = {
  bold: boolean;
  bulletList: boolean;
  canRedo: boolean;
  canUndo: boolean;
  heading: boolean;
  italic: boolean;
  link: boolean;
  orderedList: boolean;
  quote: boolean;
};

const inactiveFormattingState: FormattingState = {
  bold: false,
  bulletList: false,
  canRedo: false,
  canUndo: false,
  heading: false,
  italic: false,
  link: false,
  orderedList: false,
  quote: false,
};

function EditorButton({ active, children, disabled = false, label, onClick }: EditorButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-active={active ? "true" : undefined}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function normalizeLink(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;

  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function FormattingActions({ editor, onLink, state }: { editor: Editor; onLink: () => void; state: FormattingState }) {
  return (
    <>
      <EditorButton
        active={state.heading}
        label="Toggle heading"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </EditorButton>
      <EditorButton
        active={state.bold}
        label="Toggle bold"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </EditorButton>
      <EditorButton
        active={state.italic}
        label="Toggle italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </EditorButton>
      <EditorButton
        active={state.link}
        label={state.link ? "Remove link" : "Add link"}
        onClick={onLink}
      >
        {state.link ? "Unlink" : "Link"}
      </EditorButton>
    </>
  );
}

function ExtendedFormattingActions({ editor, onLink, state }: { editor: Editor; onLink: () => void; state: FormattingState }) {
  return (
    <>
      <FormattingActions editor={editor} onLink={onLink} state={state} />
      <EditorButton
        active={state.bulletList}
        label="Toggle bulleted list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        Bulleted list
      </EditorButton>
      <EditorButton
        active={state.orderedList}
        label="Toggle numbered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        Numbered list
      </EditorButton>
      <EditorButton
        active={state.quote}
        label="Toggle quote"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        Quote
      </EditorButton>
      <EditorButton
        disabled={!state.canUndo}
        label="Undo"
        onClick={() => editor.chain().focus().undo().run()}
      >
        Undo
      </EditorButton>
      <EditorButton
        disabled={!state.canRedo}
        label="Redo"
        onClick={() => editor.chain().focus().redo().run()}
      >
        Redo
      </EditorButton>
    </>
  );
}

export function MarkdownNoteEditor({ initialValue, onChange }: MarkdownNoteEditorProps) {
  const [formatActionsOpen, setFormatActionsOpen] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const formatMenuId = useId();
  const linkErrorId = useId();
  const linkInputRef = useRef<HTMLInputElement>(null);
  const lastValueRef = useRef(initialValue.trim());
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({ heading: { levels: [3] }, link: false }),
      Link.configure({
        autolink: true,
        linkOnPaste: true,
        openOnClick: false,
        HTMLAttributes: { rel: "noreferrer noopener", target: "_blank" },
      }),
      Placeholder.configure({ placeholder: "Add a scheduling note…" }),
      Markdown,
    ],
    content: initialValue,
    contentType: "markdown",
    editorProps: {
      attributes: {
        "aria-label": "Scheduling note",
        "aria-multiline": "true",
        role: "textbox",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      const markdown = updatedEditor.getMarkdown().trim();
      lastValueRef.current = markdown;
      onChangeRef.current(markdown);
    },
  }, []);

  const formattingState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) return inactiveFormattingState;

      return {
        bold: currentEditor.isActive("bold"),
        bulletList: currentEditor.isActive("bulletList"),
        canRedo: currentEditor.can().chain().focus().redo().run(),
        canUndo: currentEditor.can().chain().focus().undo().run(),
        heading: currentEditor.isActive("heading", { level: 3 }),
        italic: currentEditor.isActive("italic"),
        link: currentEditor.isActive("link"),
        orderedList: currentEditor.isActive("orderedList"),
        quote: currentEditor.isActive("blockquote"),
      };
    },
  }) ?? inactiveFormattingState;

  useEffect(() => {
    if (!editor) return;

    const nextValue = initialValue.trim();
    if (nextValue === lastValueRef.current) return;

    if (editor.getMarkdown().trim() !== nextValue) {
      editor.commands.setContent(nextValue, { contentType: "markdown", emitUpdate: false });
    }
    lastValueRef.current = nextValue;
  }, [editor, initialValue]);

  useEffect(() => {
    if (linkFormOpen) linkInputRef.current?.focus();
  }, [linkFormOpen]);

  if (!editor) {
    return <div className="markdown-editor-surface markdown-editor-loading" aria-busy="true" />;
  }

  function openLinkForm() {
    const activeEditor = editor;
    if (!activeEditor) return;

    if (activeEditor.isActive("link")) {
      activeEditor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    setLinkUrl(activeEditor.getAttributes("link").href ?? "");
    setLinkError(null);
    setLinkFormOpen(true);
  }

  function closeLinkForm() {
    const activeEditor = editor;
    if (!activeEditor) return;
    setLinkFormOpen(false);
    setLinkError(null);
    setLinkUrl("");
    window.requestAnimationFrame(() => activeEditor.commands.focus());
  }

  function applyLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const activeEditor = editor;
    if (!activeEditor) return;

    const href = normalizeLink(linkUrl);
    if (!href) {
      setLinkError("Enter a full http or https address.");
      return;
    }

    activeEditor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    closeLinkForm();
  }

  return (
    <div className="markdown-editor">
      <BubbleMenu
        editor={editor}
        className="markdown-editor-bubble"
        options={{ placement: "top", strategy: "absolute" }}
        shouldShow={({ from, to }) => from !== to}
        updateDelay={0}
      >
        <FormattingActions editor={editor} onLink={openLinkForm} state={formattingState} />
      </BubbleMenu>

      <button
        type="button"
        className="markdown-format-trigger"
        aria-controls={formatMenuId}
        aria-expanded={formatActionsOpen}
        data-active={formatActionsOpen ? "true" : undefined}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setFormatActionsOpen((open) => !open)}
      >
        Format note
      </button>

      {formatActionsOpen ? (
        <div className="markdown-editor-action-grid" id={formatMenuId} role="toolbar" aria-label="Note formatting">
          <ExtendedFormattingActions editor={editor} onLink={openLinkForm} state={formattingState} />
        </div>
      ) : null}

      {linkFormOpen ? (
        <form className="markdown-editor-link-form" onSubmit={applyLink} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeLinkForm(); } }}>
          <label htmlFor={formatMenuId + "-link"}>Link URL</label>
          <input
            ref={linkInputRef}
            id={formatMenuId + "-link"}
            type="text"
            inputMode="url"
            autoComplete="url"
            value={linkUrl}
            onChange={(event) => { setLinkUrl(event.target.value); setLinkError(null); }}
            aria-describedby={linkError ? linkErrorId : undefined}
            placeholder="https://example.com"
          />
          <div className="markdown-editor-link-actions">
            <button type="button" onClick={closeLinkForm}>Cancel</button>
            <button type="submit">Apply link</button>
          </div>
          {linkError ? <p id={linkErrorId} role="alert">{linkError}</p> : null}
        </form>
      ) : null}

      <EditorContent editor={editor} className="markdown-editor-surface" />
    </div>
  );
}
