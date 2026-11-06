# Multi-site CMS foundation

This migration starts the reusable CMS without replacing the existing portfolio CMS.

## What the migration adds

- `cms_sites`: independent website registry.
- `cms_site_members`: per-website owner/admin/editor/viewer roles.
- `cms_pages`: pages for each website.
- `cms_sections`: nested sections, layout keys, and JSON field schemas.
- `cms_content`: structured content records scoped to a site, page, and section.
- `cms_media`: media metadata scoped to a site, page, and section.
- Private `cms-media` storage bucket with per-site upload permissions and published-media read rules.
- `cms_create_site` and `cms_bootstrap_portfolio_site` RPCs.

## Safety

The migration is additive. It contains no DROP statements and does not drop or rewrite `portfolio_content`, the existing `portfolio-media` bucket, its objects, or its RLS policies. New CMS foreign keys do not cascade parent deletions into child content. It creates new tables, indexes, functions, triggers, policies, and a separate private bucket. The existing portfolio admin remains the bootstrap authority for the first Portfolio site.

Do not make either media bucket public and do not put a Supabase service-role key in browser code.

## Apply

Run `migrations/20261106_multi_site_cms_foundation.sql` once in the intended Supabase project after reviewing it. Then sign in to the existing portfolio admin with the current authorized administrator account so the first-site bootstrap function can assign that account as the Portfolio site's owner.

The migration is not applied merely by committing this file to Git.

## Website structure discovery

The portfolio admin now reads `../index.html` after a successful administrator login. It discovers semantic `section[id]` elements and `.topic[id]` subsections and builds navigation from their headings/links. It also creates or updates the Portfolio `Home` page and mirrors the discovered main sections and nested topics into `cms_pages` and `cms_sections`. Subsections retain their parent section relationship when their HTML structure exposes one.

This synchronization updates section titles and order to match the public HTML while preserving existing section IDs, layout keys, field schemas, and statuses. It does not parse arbitrary HTML into editable form fields or rewrite the public page. A site-specific manifest and schema-driven editor are still needed to make each section's actual content editable and renderable safely.

## Current rollout boundary

The current portfolio CRUD editor still reads and writes the legacy `portfolio_content` table. The new `cms_*` tables are the multi-site foundation and are not yet the active content store for that editor. Do not migrate or delete legacy records until the site selector, schema-driven page/section editor, public renderer, and media workflow have been connected and tested together.
