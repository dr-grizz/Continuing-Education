"use client";
import NextLink from "next/link";
import { useEffect, useRef, useState } from "react";
import { Link, Typography } from "@mui/material";
import { arrive, focusOnArrival } from "./arrival-focus";
import { SalesPageEditor } from "./staff-sales-pages";
import { useUnsavedChanges } from "./unsaved-changes";

// A collection's or pathway's sales page at /staff/collections/{id}/sales-page:
// the same editor as an offering's Sales page tab. Content editors edit it;
// other staff can view.
export function StaffCollectionSalesPage({
  id,
  canEdit,
  onChanged,
}: {
  id: string;
  canEdit: boolean;
  onChanged: (message: string) => void;
}) {
  const [title, setTitle] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const { setDirty, guard } = useUnsavedChanges();
  useEffect(() => {
    if (title) focusOnArrival(heading.current, "collection-page");
  }, [title]);
  return (
    <>
      <Link
        component={NextLink}
        href="/staff/collections"
        onClick={(event: React.MouseEvent) =>
          guard("/staff/collections", event, () => arrive("collections"))
        }
        underline="always"
        sx={{ display: "inline-block", mb: 2 }}
      >
        All collections and pathways
      </Link>
      <Typography
        variant="h5"
        component="h2"
        ref={heading}
        tabIndex={-1}
        sx={{ outline: "none", overflowWrap: "anywhere" }}
      >
        {title ?? "Collection"}
      </Typography>
      <Typography variant="h6" component="h3" sx={{ mt: 2, mb: 2 }}>
        Sales page
      </Typography>
      <SalesPageEditor
        owner="collection"
        id={id}
        canEdit={canEdit}
        onChanged={onChanged}
        onDirtyChange={setDirty}
        onSubject={(subject) => setTitle(subject.title)}
      />
    </>
  );
}
