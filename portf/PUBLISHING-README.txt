PERSONAL PORTFOLIO - NETLIFY DEPLOYMENT

This folder (portf/) contains the publish-ready static website:
  - index.html          the website
  - public-cms.js       loads published content from Supabase (public key only)
  - visual-editor.js    admin editor, activated only with ?mode=edit
  - netlify.toml        Netlify settings (no redirects)

Before publishing:
1. Confirm in Supabase that the service_role key is not in any file.
2. Confirm Row Level Security is enabled on every table.
3. Only then make the GitHub repository public.

To publish with Netlify Drop:
1. Sign in at https://app.netlify.com/drop
2. Drag the portf folder onto the drop area.
3. Open the generated *.netlify.app URL.
4. Test navigation, the work/topic popups, both carousels, external social
   links, and the WhatsApp consultation form.

The website is static. The consultation form opens WhatsApp with a prefilled
message and does not store enquiries in a database.
