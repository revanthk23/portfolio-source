// Add your Supabase Project URL and public anon/publishable key here.
// Never put a service_role or secret key in this file.
const SUPABASE_URL = "https://lfmbvvwnrhohdifypuyw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_kwoxePVR6yzu60XODZJhxg_Kngnh01x";

const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const loginButton = document.getElementById("loginButton");
const adminEmail = document.getElementById("adminEmail");

let supabaseClient;

function showLogin(message = "") {
  appView.classList.add("hidden");
  loginView.classList.remove("hidden");
  loginMessage.textContent = message;
}
function showApp(email) {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  adminEmail.textContent = email || "Administrator";
}
function configReady() {
  return SUPABASE_URL.startsWith("https://")
    && !SUPABASE_URL.includes("PASTE_")
    && SUPABASE_ANON_KEY.length > 20
    && !SUPABASE_ANON_KEY.includes("PASTE_");
}

async function verifyAdministrator() {
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    showLogin();
    return false;
  }

  // This RPC checks the protected portfolio_admins table on the server.
  const { data: isAdmin, error } = await supabaseClient.rpc("is_portfolio_admin");
  if (error || isAdmin !== true) {
    await supabaseClient.auth.signOut();
    showLogin("This account is not authorized to access the portfolio dashboard.");
    return false;
  }

  showApp(user.email);
  return true;
}

async function start() {
  if (!configReady()) {
    showLogin("Setup required: add your Supabase Project URL and public anon/publishable key in admin.js.");
    loginButton.disabled = true;
    return;
  }
  if (!window.supabase?.createClient) {
    showLogin("Supabase library could not load. Check your internet connection and refresh.");
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) await verifyAdministrator();

  supabaseClient.auth.onAuthStateChange(async (_event, sessionNow) => {
    if (!sessionNow) showLogin();
    // Do not perform an RPC inside this callback; initial sign-in is verified below.
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient) return;
  loginButton.disabled = true;
  loginButton.textContent = "Signing in…";
  loginMessage.textContent = "";
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    loginMessage.textContent = "Sign-in failed. Check your email and password, then try again.";
  } else {
    await verifyAdministrator();
  }
  loginButton.disabled = false;
  loginButton.textContent = "Sign in";
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  if (supabaseClient) await supabaseClient.auth.signOut();
  showLogin("You have signed out.");
});

document.getElementById("sectionNav").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-section]");
  if (!button) return;
  document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  const section = button.dataset.section;
  const titles = {
    overview:"Overview",about:"About Me",experience:"Experience",projects:"Projects",
    skills:"Skills",services:"Services",food:"Food Business",farm:"Farm Business",
    courses:"Courses",images:"Image Library",videos:"Video Library",
    contact:"Contact Details",settings:"Website Settings"
  };
  document.getElementById("pageTitle").textContent = titles[section] || "Overview";
  if (section !== "overview") {
    document.getElementById("contentPanel").innerHTML =
      `<div class="notice"><strong>${titles[section]}</strong><p>This section will be connected to your Supabase content and media in the next implementation stage. Your existing public website has not been changed.</p></div>`;
  } else {
    location.reload();
  }
});

start();
