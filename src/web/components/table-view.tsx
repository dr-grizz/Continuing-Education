"use client";
import { useState } from "react";
import {
  MenuItem,
  TableCell,
  TablePagination,
  TableSortLabel,
  TextField,
} from "@mui/material";

type Direction = "asc" | "desc";
export type TableView<T> = ReturnType<typeof useTableView<T>>;

// Client-side sort, filter and paging shared by the staff tables and their phone card lists.
export function useTableView<T>(
  rows: T[],
  options: {
    compare: Record<string, (a: T, b: T) => number>;
    initial: { key: string; direction: Direction };
    matches?: (row: T) => boolean;
  },
) {
  const [sort, setSortState] = useState(options.initial);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const filtered = options.matches ? rows.filter(options.matches) : rows;
  const compare = options.compare[sort.key];
  const sorted = [...filtered].sort((a, b) =>
    sort.direction === "asc" ? compare(a, b) : compare(b, a),
  );
  // Return to the first page when filtering leaves the current page empty.
  const lastPage = Math.max(0, Math.ceil(sorted.length / rowsPerPage) - 1);
  const currentPage = Math.min(page, lastPage);
  return {
    sort,
    setSort(key: string, direction?: Direction) {
      setSortState((current) => ({
        key,
        direction:
          direction ??
          (current.key === key && current.direction === "asc" ? "desc" : "asc"),
      }));
    },
    total: rows.length,
    count: sorted.length,
    visible: sorted.slice(
      currentPage * rowsPerPage,
      currentPage * rowsPerPage + rowsPerPage,
    ),
    page: currentPage,
    setPage,
    rowsPerPage,
    setRowsPerPage(value: number) {
      setRowsPerPage(value);
      setPage(0);
    },
  };
}

export function SortableHeader<T>({
  view,
  column,
  label,
}: {
  view: TableView<T>;
  column: string;
  label: string;
}) {
  const active = view.sort.key === column;
  return (
    <TableCell sortDirection={active ? view.sort.direction : false}>
      <TableSortLabel
        active={active}
        direction={active ? view.sort.direction : "asc"}
        onClick={() => view.setSort(column)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

// Phone layouts have no column headers, so sorting is offered as a select.
export function SortSelect<T>({
  view,
  options,
  label = "Sort by",
  display = { xs: "flex", sm: "none" },
}: {
  view: TableView<T>;
  options: Record<string, string>;
  label?: string;
  // Shown wherever the matching list uses cards instead of a sortable table.
  display?: Record<string, string>;
}) {
  const value = `${view.sort.key}:${view.sort.direction}`;
  return (
    <TextField
      select
      label={label}
      value={value in options ? value : ""}
      onChange={(event) => {
        const [key, direction] = event.target.value.split(":");
        view.setSort(key, direction as Direction);
      }}
      sx={{ display }}
    >
      {Object.entries(options).map(([option, text]) => (
        <MenuItem key={option} value={option}>
          {text}
        </MenuItem>
      ))}
    </TextField>
  );
}

export function TablePager<T>({
  view,
  label,
}: {
  view: TableView<T>;
  label: string;
}) {
  if (view.count <= 10) return null;
  return (
    <TablePagination
      component="nav"
      aria-label={`${label} pages`}
      count={view.count}
      page={view.page}
      onPageChange={(_, page) => view.setPage(page)}
      rowsPerPage={view.rowsPerPage}
      onRowsPerPageChange={(event) =>
        view.setRowsPerPage(Number(event.target.value))
      }
      rowsPerPageOptions={[10, 25, 50]}
    />
  );
}
