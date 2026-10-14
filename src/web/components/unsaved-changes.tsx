"use client";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

// Unsaved changes in the staff workspace. A form reports whether it has
// unsaved changes with `setDirty`; links in the workspace (the staff sidebar,
// offering tabs) call `guard` from their onClick, which asks "Leave without
// saving?" first. Closing or reloading the browser tab gets the browser's own
// warning.
type Guard = {
  setDirty: (dirty: boolean) => void;
  /** Call from a link's onClick. `onLeave` runs only if navigation goes ahead. */
  guard: (href: string, event: React.MouseEvent, onLeave?: () => void) => void;
};
const UnsavedChanges = createContext<Guard>({
  setDirty: () => undefined,
  guard: (_href, _event, onLeave) => onLeave?.(),
});
export const useUnsavedChanges = () => useContext(UnsavedChanges);

export function UnsavedChangesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false),
    [leaving, setLeaving] = useState<{ href: string; onLeave?: () => void }>();
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function guard(href: string, event: React.MouseEvent, onLeave?: () => void) {
    if (!dirty) {
      onLeave?.();
      return;
    }
    event.preventDefault();
    setLeaving({ href, onLeave });
  }
  return (
    <UnsavedChanges.Provider value={{ setDirty, guard }}>
      {children}
      <Dialog
        open={!!leaving}
        onClose={() => setLeaving(undefined)}
        aria-labelledby="unsaved-changes-title"
        maxWidth="xs"
      >
        <DialogTitle id="unsaved-changes-title">
          Leave without saving?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            This page has unsaved changes. They will be lost if you leave.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeaving(undefined)}>Stay</Button>
          <Button
            color="error"
            onClick={() => {
              if (!leaving) return;
              setDirty(false);
              leaving.onLeave?.();
              router.push(leaving.href);
              setLeaving(undefined);
            }}
          >
            Discard changes
          </Button>
        </DialogActions>
      </Dialog>
    </UnsavedChanges.Provider>
  );
}
