"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CmsShell } from "@/components/cms-shell";
import { RequireAuth } from "@/components/require-auth";
import {
  ProductPrompt,
  ProductPromptCategory,
  createProductPrompt,
  deleteProductPrompt,
  listProductPrompts,
  updateProductPrompt,
} from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";

type EditorState = {
  id: string | null;
  name: string;
  category: string;
  content: string;
};

const EMPTY_EDITOR: EditorState = {
  id: null,
  name: "",
  category: "",
  content: "",
};

export default function ProductPromptsPage() {
  return (
    <RequireAuth>
      <ProductPromptsContent />
    </RequireAuth>
  );
}

function ProductPromptsContent() {
  const [items, setItems] = useState<ProductPrompt[]>([]);
  const [categories, setCategories] = useState<ProductPromptCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listProductPrompts({
        category: selectedCategory || undefined,
        q: searchQuery || undefined,
      });
      setItems(result.items);
      setCategories(result.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load prompts");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditor({
      ...EMPTY_EDITOR,
      category: selectedCategory,
    });
    setError(null);
    setMessage(null);
  }

  function openEdit(prompt: ProductPrompt) {
    setEditor({
      id: prompt.id,
      name: prompt.name,
      category: prompt.category,
      content: prompt.content,
    });
    setError(null);
    setMessage(null);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;

    const input = {
      name: editor.name.trim(),
      category: editor.category.trim(),
      content: editor.content.trim(),
    };
    if (!input.name || !input.category || !input.content) {
      setError("Name, category, and prompt content are required.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (editor.id) {
        await updateProductPrompt(editor.id, input);
        setMessage(`Updated “${input.name}”.`);
      } else {
        await createProductPrompt(input);
        setMessage(`Created “${input.name}”.`);
      }
      setEditor(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save prompt");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(prompt: ProductPrompt) {
    if (!window.confirm(`Delete prompt “${prompt.name}”?`)) return;
    setDeletingId(prompt.id);
    setError(null);
    setMessage(null);
    try {
      await deleteProductPrompt(prompt.id);
      setMessage(`Deleted “${prompt.name}”.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete prompt");
    } finally {
      setDeletingId(null);
    }
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setSearchQuery(searchInput.trim());
  }

  const totalPrompts = categories.reduce(
    (sum, category) => sum + category.count,
    0,
  );

  return (
    <CmsShell
      title="Product prompts"
      subtitle="Save reusable image-generation instructions and organize them by product category."
      actions={
        <button
          type="button"
          onClick={openCreate}
          className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          + New prompt
        </button>
      }
    >
      <div className="space-y-5">
        {message ? (
          <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
            {message}
          </p>
        ) : null}
        {error && !editor ? (
          <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <form
          onSubmit={onSearch}
          className="flex gap-2 rounded-2xl border border-line bg-surface p-3"
        >
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search prompt name, category, or content…"
            className="min-w-0 flex-1 rounded-xl border border-line bg-background px-3.5 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-white"
          >
            Search
          </button>
          {searchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearchQuery("");
              }}
              className="rounded-xl border border-line px-3 py-2 text-sm text-muted"
            >
              Clear
            </button>
          ) : null}
        </form>

        <div className="grid items-start gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-line bg-surface p-3 lg:sticky lg:top-24">
            <div className="px-2 pb-2 pt-1">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                Categories
              </p>
            </div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setSelectedCategory("")}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${
                  selectedCategory === ""
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                <span>All prompts</span>
                <span className="text-xs tabular-nums">{totalPrompts}</span>
              </button>
              {categories.map((category) => (
                <button
                  key={category.name}
                  type="button"
                  onClick={() => setSelectedCategory(category.name)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${
                    selectedCategory === category.name
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-muted hover:bg-background hover:text-foreground"
                  }`}
                >
                  <span className="truncate">{category.name}</span>
                  <span className="ml-2 text-xs tabular-nums">
                    {category.count}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="font-semibold">
                  {selectedCategory || "All prompts"}
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  {loading ? "Loading…" : `${items.length} prompts shown`}
                </p>
              </div>
              {selectedCategory ? (
                <button
                  type="button"
                  onClick={openCreate}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-accent"
                >
                  Add to category
                </button>
              ) : null}
            </div>

            {loading ? (
              <div className="px-6 py-16 text-center text-sm text-muted">
                Loading prompts…
              </div>
            ) : items.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="font-medium">No prompts found</p>
                <p className="mt-1 text-sm text-muted">
                  Create a prompt or try another category and search term.
                </p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-5 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-white"
                >
                  Create first prompt
                </button>
              </div>
            ) : (
              <ul>
                {items.map((prompt, index) => (
                  <li
                    key={prompt.id}
                    className={`px-5 py-5 ${
                      index < items.length - 1 ? "border-b border-line" : ""
                    }`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{prompt.name}</h3>
                          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
                            {prompt.category}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted">
                          {prompt.content}
                        </p>
                        <p className="mt-2 text-xs text-muted">
                          Updated {formatDateTime(prompt.updatedAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(prompt)}
                          className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-foreground/20"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === prompt.id}
                          onClick={() => void onDelete(prompt)}
                          className="rounded-lg border border-line px-3 py-1.5 text-sm text-danger disabled:opacity-50"
                        >
                          {deletingId === prompt.id ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {editor ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !saving)
              setEditor(null);
          }}
        >
          <form
            onSubmit={onSave}
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-editor-title"
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-2xl sm:rounded-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-wide text-accent uppercase">
                  {editor.id ? "Edit prompt" : "New prompt"}
                </p>
                <h2
                  id="prompt-editor-title"
                  className="mt-1 text-2xl font-semibold tracking-tight"
                >
                  {editor.id ? editor.name || "Edit prompt" : "Create prompt"}
                </h2>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditor(null)}
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Prompt name</span>
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={editor.name}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, name: event.target.value } : null,
                    )
                  }
                  placeholder="Example: Summer floral dress"
                  className="w-full rounded-xl border border-line bg-background px-3.5 py-2.5 outline-none focus:border-accent"
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Category</span>
                <input
                  required
                  maxLength={80}
                  list="product-prompt-categories"
                  value={editor.category}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? { ...current, category: event.target.value }
                        : null,
                    )
                  }
                  placeholder="Example: Silk dresses"
                  className="w-full rounded-xl border border-line bg-background px-3.5 py-2.5 outline-none focus:border-accent"
                />
                <datalist id="product-prompt-categories">
                  {categories.map((category) => (
                    <option key={category.name} value={category.name} />
                  ))}
                </datalist>
              </label>
            </div>

            <label className="mt-4 block space-y-1.5 text-sm">
              <span className="font-medium">Prompt content</span>
              <textarea
                required
                maxLength={50_000}
                rows={16}
                value={editor.content}
                onChange={(event) =>
                  setEditor((current) =>
                    current
                      ? { ...current, content: event.target.value }
                      : null,
                  )
                }
                placeholder="Write the complete instructions ChatGPT should follow for this product category…"
                className="w-full resize-y rounded-xl border border-line bg-background px-3.5 py-3 font-mono text-sm leading-6 outline-none focus:border-accent"
              />
            </label>

            {error ? (
              <p className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditor(null)}
                className="rounded-xl border border-line px-4 py-2.5 text-sm text-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving
                  ? "Saving…"
                  : editor.id
                    ? "Save changes"
                    : "Create prompt"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </CmsShell>
  );
}
