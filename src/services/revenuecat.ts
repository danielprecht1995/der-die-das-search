import { Platform } from 'react-native';
import {
  REVENUECAT_API_KEY_IOS,
  REVENUECAT_API_KEY_ANDROID,
  REVENUECAT_ENTITLEMENT_ID,
  REVENUECAT_PRODUCT_ID_MONTHLY,
  REVENUECAT_PRODUCT_ID_YEARLY,
} from '../config';

type Plan = 'monthly' | 'yearly';

type CustomerInfo = {
  entitlements?: { active?: Record<string, unknown> };
};

let PurchasesModule: any = null;
let PurchasesLogLevel: any = null;
let RevenueCatUIModule: any = null;
let RevenueCatUIPaywallResult: any = null;
let configured = false;
let lastRevenueCatError: string | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const purchasesPkg = require('react-native-purchases');
  PurchasesModule = purchasesPkg.default ?? purchasesPkg;
  PurchasesLogLevel = purchasesPkg.LOG_LEVEL ?? null;
} catch {
  PurchasesModule = null;
  PurchasesLogLevel = null;
}

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const purchasesUIPkg = require('react-native-purchases-ui');
  RevenueCatUIModule = purchasesUIPkg.default ?? purchasesUIPkg;
  RevenueCatUIPaywallResult = purchasesUIPkg.PAYWALL_RESULT ?? null;
} catch {
  RevenueCatUIModule = null;
  RevenueCatUIPaywallResult = null;
}

function getApiKey() {
  return Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
}

function setLastError(message: string | null) {
  lastRevenueCatError = message;
}

function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Unknown purchase error.';
  const anyError = error as any;
  if (anyError?.userCancelled) return 'Purchase was cancelled.';
  const code = anyError?.code ? ` (${String(anyError.code)})` : '';
  const message = anyError?.message ? String(anyError.message) : 'Unknown purchase error.';
  return `${message}${code}`;
}

function getFallbackProductId(plan: Plan): string {
  return plan === 'monthly' ? REVENUECAT_PRODUCT_ID_MONTHLY : REVENUECAT_PRODUCT_ID_YEARLY;
}

export function isRevenueCatAvailable(): boolean {
  return Boolean(PurchasesModule) && (Platform.OS === 'ios' || Platform.OS === 'android');
}

export function getLastRevenueCatError(): string | null {
  return lastRevenueCatError;
}

export async function initializeRevenueCat(): Promise<boolean> {
  if (!isRevenueCatAvailable()) {
    setLastError('RevenueCat module is not available on this platform/build.');
    return false;
  }
  const key = getApiKey();
  if (!key) {
    setLastError(`Missing RevenueCat API key for platform: ${Platform.OS}.`);
    return false;
  }
  if (configured) return true;
  try {
    if (__DEV__ && PurchasesLogLevel?.VERBOSE && typeof PurchasesModule.setLogLevel === 'function') {
      PurchasesModule.setLogLevel(PurchasesLogLevel.VERBOSE);
    }
    if (__DEV__ && typeof PurchasesModule.setLogHandler === 'function') {
      PurchasesModule.setLogHandler((logLevel: string, message: string) => {
        const level = String(logLevel ?? '').toUpperCase();
        const text = String(message ?? '');
        const looksLikeCancellation =
          text.toLowerCase().includes('purchase was cancelled') ||
          text.toLowerCase().includes('purchase was canceled') ||
          text.toLowerCase().includes('user cancelled');

        // RevenueCat emits cancellation as an error log in dev; treat it as info for UX.
        if (looksLikeCancellation) {
          console.log(`[RevenueCat] ${text}`);
          return;
        }

        if (level.includes('ERROR')) {
          console.error(`[RevenueCat] ${text}`);
          return;
        }
        if (level.includes('WARN')) {
          console.warn(`[RevenueCat] ${text}`);
          return;
        }
        console.log(`[RevenueCat] ${text}`);
      });
    }
    await PurchasesModule.configure({ apiKey: key });
    configured = true;
    setLastError(null);
    return true;
  } catch (error) {
    setLastError(`RevenueCat initialization failed: ${getErrorMessage(error)}`);
    return false;
  }
}

function isActive(info: CustomerInfo | null): boolean {
  if (!info?.entitlements?.active) return false;
  return Boolean(info.entitlements.active[REVENUECAT_ENTITLEMENT_ID]);
}

export async function syncSubscriptionStatus(): Promise<boolean> {
  const ready = await initializeRevenueCat();
  if (!ready) return false;
  try {
    const info: CustomerInfo = await PurchasesModule.getCustomerInfo();
    setLastError(null);
    return isActive(info);
  } catch (error) {
    setLastError(`Could not fetch subscription status: ${getErrorMessage(error)}`);
    return false;
  }
}

function pickPackage(offerings: any, plan: Plan): any | null {
  const available = offerings?.current?.availablePackages ?? [];
  const wantType = plan === 'monthly' ? 'MONTHLY' : 'ANNUAL';
  const byType = available.find((p: any) => String(p?.packageType ?? '').toUpperCase() === wantType);
  if (byType) return byType;

  const byId = available.find((p: any) => {
    const id = String(p?.identifier ?? '').toLowerCase();
    if (plan === 'monthly') return id.includes('month');
    return id.includes('year') || id.includes('annual');
  });
  if (byId) return byId;

  const byProductId = available.find((p: any) => {
    const id = String(p?.storeProduct?.identifier ?? '').toLowerCase();
    if (plan === 'monthly') return id.includes('month');
    return id.includes('year') || id.includes('annual');
  });
  if (byProductId) return byProductId;

  return null;
}

export async function purchasePlan(plan: Plan): Promise<boolean> {
  const ready = await initializeRevenueCat();
  if (!ready) return false;
  try {
    const offerings = await PurchasesModule.getOfferings();
    const selected = pickPackage(offerings, plan);
    if (selected) {
      const result = await PurchasesModule.purchasePackage(selected);
      const active = isActive(result?.customerInfo as CustomerInfo);
      setLastError(active ? null : `Purchase completed but entitlement "${REVENUECAT_ENTITLEMENT_ID}" is not active.`);
      return active;
    }

    // Fallback path: purchase by explicit product ID when offerings/packages are not configured.
    const fallbackProductId = getFallbackProductId(plan);
    if (fallbackProductId) {
      const products = await PurchasesModule.getProducts([fallbackProductId]);
      const target = (products ?? []).find((p: any) => p?.identifier === fallbackProductId);
      if (target && typeof PurchasesModule.purchaseStoreProduct === 'function') {
        const result = await PurchasesModule.purchaseStoreProduct(target);
        const active = isActive(result?.customerInfo as CustomerInfo);
        setLastError(active ? null : `Purchase completed but entitlement "${REVENUECAT_ENTITLEMENT_ID}" is not active.`);
        return active;
      }
      setLastError(`Configured fallback product ID "${fallbackProductId}" was not found in App Store products.`);
      return false;
    }

    setLastError(
      `No purchasable ${plan} package found. Configure RevenueCat default offering/packages or set fallback product IDs in src/config.ts.`
    );
    return false;
  } catch (error) {
    setLastError(getErrorMessage(error));
    return false;
  }
}

export async function restoreRevenueCatPurchases(): Promise<boolean> {
  const ready = await initializeRevenueCat();
  if (!ready) return false;
  try {
    const info: CustomerInfo = await PurchasesModule.restorePurchases();
    const active = isActive(info);
    setLastError(active ? null : `No active "${REVENUECAT_ENTITLEMENT_ID}" entitlement found to restore.`);
    return active;
  } catch (error) {
    setLastError(getErrorMessage(error));
    return false;
  }
}

export async function presentRevenueCatPaywall(): Promise<boolean> {
  const ready = await initializeRevenueCat();
  if (!ready) return false;
  if (!RevenueCatUIModule || !RevenueCatUIPaywallResult) {
    setLastError('RevenueCat paywall UI module is unavailable in this build.');
    return false;
  }
  try {
    const result = await RevenueCatUIModule.presentPaywall();
    switch (result) {
      case RevenueCatUIPaywallResult.PURCHASED:
      case RevenueCatUIPaywallResult.RESTORED:
        setLastError(null);
        return true;
      case RevenueCatUIPaywallResult.NOT_PRESENTED:
        setLastError('Paywall was not presented.');
        return false;
      case RevenueCatUIPaywallResult.ERROR:
        setLastError('Paywall purchase flow returned an error.');
        return false;
      case RevenueCatUIPaywallResult.CANCELLED:
        setLastError('Purchase was cancelled.');
        return false;
      default:
        setLastError('Paywall flow ended without purchase.');
        return false;
    }
  } catch (error) {
    setLastError(getErrorMessage(error));
    return false;
  }
}
