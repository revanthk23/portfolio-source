PORTFOLIO ADMIN — STAGE 2 (PRIVATE LOGIN FOUNDATION)

WHAT THIS PACKAGE DOES
- Adds a private /admin/ login page.
- Uses Supabase Auth email/password sign-in.
- Verifies administrator permission by calling public.is_portfolio_admin().
- Does not provide sign-up or account creation.
- Includes a dashboard shell for the planned portfolio sections.

INSTALLATION
1. Unzip this folder.
2. Copy the contents (index.html, admin.css, admin.js) into a folder named "admin"
   inside the same local project folder that contains your current public portfolio index.html.
   Your structure should look like:
       your-portfolio/
         index.html
         ...existing assets...
         admin/
           index.html
           admin.css
           admin.js
3. In Supabase, open Project Settings -> API (or Connect) and locate:
   - Project URL
   - anon/public key or publishable key
4. Open admin/admin.js in a code editor.
5. Replace only these two placeholder values:
   SUPABASE_URL
   SUPABASE_ANON_KEY
   Use the Project URL and public anon/publishable key.
   Do NOT use the service_role key or any secret key.
6. Save the file.
7. Deploy the whole existing portfolio project folder to the same Netlify site
   using the same deployment method you used previously.
8. Visit https://YOUR-SITE.netlify.app/admin/

SECURITY NOTES
- Do not add a sign-up form.
- Keep Supabase public signups disabled.
- The public anon/publishable key is designed for frontend use; RLS is what protects data.
- Never put a service_role/secret key in browser code.
- The dashboard calls the is_portfolio_admin() function. If the function name or
  permission setup differs, the admin check will fail closed.
- This stage is only the login/dashboard shell. Content editing, uploads,
  revisions, preview and publishing will be implemented next.
