# Email Response Builder

GitHub-friendly file layout:

- `index.html` — app shell
- `styles.css` — visual styles
- `app.js` — app logic
- `email-elements.json` — optional starter/default saved email elements for Tabs 1–6
- `quote-items.json` — quote builder price list

## Recommended day-to-day workflow

Use the app normally. Changes save automatically in your browser as you update tabs, saved elements, quote settings, packages, and app settings.

For regular backup, click **Backup all** in the top bar. This downloads a dated file like:

`email-builder-full-backup-YYYY-MM-DD.json`

To move to a new computer/browser or recover your setup, click **Restore backup** and select that file.

## About `email-elements.json`

The app will load `email-elements.json` only when there is no existing local browser data. This prevents an older GitHub JSON file from overwriting your regular daily changes.

Element-specific import/export controls have been removed from the Saved elements column. Use **Export full backup** and **Restore full backup** for regular backups.

## Updating quote items

The quote builder still uses `quote-items.json` as the hosted price list. Replace this file in GitHub when you want your published default price list updated.
