import { useState, createContext, useContext } from "react";

// window.confirm() is unreliable inside iOS "Add to Home Screen" PWAs
// (display: standalone) — it can be suppressed, auto-dismissed, or behave
// inconsistently depending on iOS version. This is a real on-screen modal
// instead, so destructive actions (delete project, delete note, etc.)
// always show an unmistakable confirmation the person has to tap.

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { message, resolve, confirmLabel, danger }

  function confirm(message, options = {}) {
    const { confirmLabel = "OK", danger = false } = typeof options === "string" ? { confirmLabel: options } : options;
    return new Promise((resolve) => {
      setState({ message, resolve, confirmLabel, danger });
    });
  }

  function handleChoice(result) {
    state?.resolve(result);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-6">
          <div className="bg-app-surface rounded-3xl p-6 w-full max-w-sm">
            <p className="text-[15px] leading-relaxed mb-5 whitespace-pre-wrap">{state.message}</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleChoice(false)}
                className="flex-1 rounded-xl border px-4 py-3 text-sm font-semibold"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleChoice(true)}
                className={`flex-1 rounded-xl text-white px-4 py-3 text-sm font-semibold ${state.danger ? "bg-red-600" : "bg-black"}`}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

// Returns an async confirm(message) function — await it instead of relying
// on window.confirm's return value.
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside ConfirmProvider");
  return confirm;
}
