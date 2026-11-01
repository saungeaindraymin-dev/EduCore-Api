# API checks

End-to-end checks that drive the running API over HTTP. Each suite signs its own tokens,
creates the users/courses it needs, and deletes them again when it finishes.

```bash
pnpm dev            # the API must be running on :4000 (Node 24 — `nvm use`)
pnpm checks         # every *.check.ts, one after another
npx tsx scripts/checks/uploads.check.ts   # a single suite
```

- `CHECK_API` points them at another API (default `http://localhost:4000/api`).
- `UPLOAD_DIR` must match the API's, so the upload suite can see files come and go on disk.
- New suites: name them `something.check.ts` and build on `lib.ts`.
- `auth-reset.check.ts` walks the forgotten-password journey. It needs the code, so it
  reads what `MAIL_TRANSPORT=log` hands back; against a server sending real mail the
  code-dependent groups report `SKIP` and the rest still run.
