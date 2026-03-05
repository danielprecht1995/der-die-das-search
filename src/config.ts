// Do not keep OpenAI keys in the mobile app.
// Keep this empty and run requests through your backend proxy.
export const OPENAI_API_KEY = '';
export const AI_PROXY_BASE_URL = 'http://localhost:8787/api';

// RevenueCat public SDK keys (from RevenueCat dashboard -> Project settings -> API Keys)
export const REVENUECAT_API_KEY_IOS = 'appl_qDLJSXrxyGHWYeXbQduTkKaKHzG';
export const REVENUECAT_API_KEY_ANDROID = '';

// RevenueCat entitlement ID that unlocks premium access
export const REVENUECAT_ENTITLEMENT_ID = 'premium';

// Optional direct product IDs (used as fallback if offerings/packages are not configured correctly)
// Example IDs: "derdiedas_monthly", "derdiedas_yearly"
export const REVENUECAT_PRODUCT_ID_MONTHLY = '';
export const REVENUECAT_PRODUCT_ID_YEARLY = '';
