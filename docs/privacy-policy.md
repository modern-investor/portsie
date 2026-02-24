# Portsie Privacy Policy

*Last updated: February 2026*

This document explains how Portsie handles your data — what we collect, how we protect it, and what control you have. We've written it in plain language so anyone can understand it.

---

## What Portsie Does

Portsie is a portfolio investment tracker. You can connect your brokerage account (like Charles Schwab) or upload financial documents (PDFs, CSVs, spreadsheets, images) and Portsie will extract and organize your holdings, balances, and transactions into a single dashboard.

---

## What Data We Collect

### Account Information
- **Email address** — used for login and account recovery
- **Brokerage connection** — if you connect Charles Schwab, we store OAuth tokens (encrypted) to access your account data on your behalf

### Financial Data (from uploads or API sync)
- **Positions** — what you own (symbol, quantity, market value)
- **Balances** — account totals (cash, equity, buying power)
- **Transactions** — buy/sell/dividend history
- **Account details** — account number (encrypted), institution name, account type

### Uploaded Files
- The original files you upload (PDFs, images, spreadsheets) are stored in isolated per-user storage
- Files have a configurable retention period and can be deleted at any time

### What We Do NOT Collect
- We do not collect your Social Security number, date of birth, or government ID
- We do not store your brokerage password — we use industry-standard OAuth
- We do not collect browsing history, device fingerprints, or analytics cookies
- We do not sell or share your data with advertisers

---

## How We Process Your Documents

When you upload a financial document, here's what happens:

1. **Upload** — Your file is stored in encrypted, per-user cloud storage
2. **AI Extraction** — The file is sent to an AI model to read and extract the financial data (positions, balances, transactions)
3. **Data Storage** — The structured data is saved to your account; the raw AI response is **not** retained
4. **You Confirm** — Data is written to your portfolio after extraction

### Which AI Models Process Your Data?

By default, Portsie uses **Google Gemini** for document extraction. If Gemini is unavailable, it falls back to **Claude** (by Anthropic). You can also configure your own Anthropic API key in Settings.

**What the AI model sees:** The content of your uploaded document (text, images, or tables). This is sent via API and processed in real-time — it is not stored by the AI provider for training purposes.

**What we keep:** Only the structured output (positions, balances, transactions) plus a small diagnostic summary (which model was used, processing time). We do **not** store the full AI response.

---

## How We Protect Your Data

### Encryption

All sensitive fields are encrypted before storage:

| Data | Protection |
|------|-----------|
| Brokerage OAuth tokens | AES-256-GCM encryption |
| Brokerage app credentials | AES-256-GCM encryption |
| Account numbers | AES-256-GCM encryption + HMAC token for lookups |
| LLM API keys (if you provide one) | AES-256-GCM encryption |

AES-256-GCM is the same encryption standard used by banks and governments. Each encrypted value includes a unique initialization vector, making every ciphertext unique even for identical inputs.

### Isolation

- Every database table uses **Row-Level Security (RLS)** — you can only access your own data, enforced at the database level
- Uploaded files are stored in per-user folders with access policies
- Admin views show redacted emails and exclude sensitive fields

### Tokenization

Account numbers are stored with a one-way HMAC token for matching purposes. This means we can match "does this uploaded account number correspond to an existing account?" without ever storing the plaintext number in a searchable field.

### Logging

Server logs automatically redact sensitive fields (account numbers, tokens, API keys, email addresses). Error diagnostics never contain your financial data.

---

## Data Retention

| Data | Retention |
|------|-----------|
| Account and portfolio data | Kept until you delete your account |
| Uploaded source files | Configurable; default 30 days after processing |
| Raw AI responses | **Not retained** |
| AI diagnostic context | Kept with upload metadata |
| Brokerage tokens | Kept until you disconnect; auto-expire |

You can delete any upload and its associated data at any time from the dashboard.

---

## Third Parties

### Cloud Infrastructure
- **Supabase** (database, auth, file storage) — hosted on AWS in Seoul (ap-northeast-2)
- Your data is encrypted at rest by Supabase/AWS

### AI Providers
- **Google (Gemini)** — processes uploaded documents for data extraction. Google's API terms state that API data is not used for model training.
- **Anthropic (Claude)** — fallback extraction engine and optional user-configured provider. Anthropic's API terms state that API data is not used for model training.

### What Third Parties See
- **AI providers** see the content of your uploaded documents during processing (not stored)
- **Supabase/AWS** stores your encrypted data (they cannot read encrypted fields without our encryption keys)
- **No other third parties** receive your data

---

## Current Architecture: Managed Cloud

In the current managed cloud mode:

- Portsie operates the infrastructure (Supabase project, encryption keys, AI API keys)
- Your data is encrypted at rest and in transit
- Row-Level Security ensures each user's data is isolated at the database level
- Encryption keys are stored as server environment variables — the Portsie team has access to them for operational purposes

**What this means:** While your data is strongly protected against external threats and other users, the Portsie team technically has the ability to decrypt sensitive fields using the server-side encryption keys. This is standard for managed cloud services (similar to how your bank can access your account data).

---

## Future: BYOB Mode (Bring Your Own Backend)

We are building a **Bring Your Own Backend (BYOB)** mode where you can:

- **Provide your own Supabase project** — your data lives entirely in your own cloud account
- **Provide your own encryption keys** — Portsie never sees or stores them
- **Provide your own AI API keys** — documents are processed using your own accounts

In BYOB mode, Portsie becomes a **zero-knowledge client**: the application code runs against your infrastructure, and we cannot access your data even if we wanted to. This is the strongest privacy guarantee possible for a cloud application.

BYOB mode is not yet available. When it launches, existing users will be able to migrate their data to their own backend.

---

## Your Rights

- **Access** — You can view all your data in the dashboard at any time
- **Delete** — You can delete individual uploads, accounts, or your entire account
- **Export** — Your financial data is yours; we support data export
- **Control** — You choose which AI provider processes your documents and can bring your own API key

---

## Contact

If you have questions about how your data is handled, contact us at privacy@portsie.com.
