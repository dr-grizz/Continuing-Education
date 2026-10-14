"use client";
import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { visuallyHidden } from "./visually-hidden";

// Stripe's published sandbox card numbers (docs.stripe.com/testing). They only
// work with sandbox (test mode) keys; the prototype refuses live keys.
const cards = [
  { number: "4242 4242 4242 4242", result: "Payment succeeds" },
  {
    number: "4000 0025 0000 3155",
    result: "Asks for authentication, then succeeds",
  },
  { number: "4000 0000 0000 0002", result: "Declined (generic decline)" },
  { number: "4000 0000 0000 9995", result: "Declined (insufficient funds)" },
];

export function StripeTestCardsButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState("");
  const copy = async (number: string) => {
    try {
      await navigator.clipboard.writeText(number.replace(/ /g, ""));
      setCopied(`Copied ${number}.`);
    } catch {
      setCopied("Copying is not available here; select the number instead.");
    }
  };
  return (
    <>
      <Button
        size="small"
        variant="text"
        color="inherit"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        sx={{ textDecoration: "underline", py: 0, minWidth: 0 }}
      >
        Test Payment Info
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setCopied("");
        }}
        aria-labelledby="stripe-test-cards-title"
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id="stripe-test-cards-title">
          Stripe sandbox test cards
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Use these on the Stripe Checkout page. For every card, enter any
            future expiry date (for example 12/34), any three-digit CVC and any
            ZIP code. They work only in the Stripe sandbox; never enter a real
            card in the prototype.
          </DialogContentText>
          <TableContainer sx={{ mt: 2 }}>
            <Table size="small">
              <caption>
                <Typography variant="body2" component="span">
                  Card numbers and what happens at checkout. More in{" "}
                  <Link
                    href="https://docs.stripe.com/testing"
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="always"
                  >
                    Stripe&apos;s testing guide (opens in a new tab)
                  </Link>
                  .
                </Typography>
              </caption>
              <TableHead>
                <TableRow>
                  <TableCell scope="col">Card number</TableCell>
                  <TableCell scope="col">Result</TableCell>
                  <TableCell scope="col">
                    <Box component="span" sx={visuallyHidden}>
                      Copy
                    </Box>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cards.map((card) => (
                  <TableRow key={card.number}>
                    <TableCell
                      scope="row"
                      component="th"
                      sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}
                    >
                      {card.number}
                    </TableCell>
                    <TableCell>{card.result}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        onClick={() => copy(card.number)}
                        aria-label={`Copy ${card.number}`}
                      >
                        Copy
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography
            role="status"
            variant="body2"
            sx={{ mt: 1, minHeight: "1.5em" }}
          >
            {copied}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setOpen(false);
              setCopied("");
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
