import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LegalDocumentPage from "./LegalDocumentPage";

let container,root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,text:async () => "Условия\nВторой абзац"}));
  container=document.createElement("div"); document.body.append(container); root=createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function renderDocument(slug) {
  await act(async () => root.render(<MemoryRouter initialEntries={[`/documents/${slug}`]}><Routes><Route path="/documents/:document" element={<LegalDocumentPage />} /></Routes></MemoryRouter>));
}
it("reads the original public text without changing it", async () => {
  await renderDocument("user-agreement");
  expect(fetch).toHaveBeenCalledWith("/legal/user-agreement.txt",expect.objectContaining({signal:expect.any(AbortSignal)}));
  expect(container.querySelector('pre').textContent).toBe("Условия\nВторой абзац");
});
it("rejects unknown documents including object prototype properties without fetching", async () => {
  await renderDocument("__proto__");
  expect(container.textContent).toContain("Документ не найден");
  expect(fetch).not.toHaveBeenCalled();
});
