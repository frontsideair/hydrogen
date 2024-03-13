import { type ReactNode, useEffect, useState , useMemo, createContext, useContext, useRef } from "react";
import { type CartReturn } from "../cart/queries/cart-types";
import {
  AnalyticsView,
  type PageViewPayload,
  type ProductViewPayload,
  type CollectionViewPayload,
  type CartViewPayload,
  type CartUpdatePayload,
  type CustomEventPayload,
  type OtherData,
  type EventPayloads,
  type EventTypes,
} from "./AnalyticsView";
import { type CurrencyCode, LanguageCode } from '@shopify/hydrogen-react/storefront-api-types';
import {AnalyticsEvent} from "./events";
import {ShopifyAnalytics} from "./ShopifyAnalytics";

export type ShopAnalytic = {
  [key: string]: unknown;
  shopId: string;
  acceptedLanguage: LanguageCode | undefined;
  currency: CurrencyCode;
  hydrogenSubchannelId: string | '0',
}

export type AnalyticsProviderProps = {
  /** React children to render. */
  children?: ReactNode;
  /** The cart or cart promise to track. */
  cart: Promise<CartReturn | null> | CartReturn | null;
  /** An optional function to set wether the user can be tracked. */
  canTrack?: () => boolean;

  /** The optional customer object to pass to events **/
  // TODO: Need to solve for this. Do we want to defer the customer in the root and pass it down?
  // or do it client-side but we don't support customer queries on the client.
  // customer?: Promise<CustomerReturn | null> | CustomerReturn | null;

  /** An optional custom payload to pass to all events. e.g language/locale/currency */
  customPayload?: Record<string, unknown>;

  // TODO: pass generic Promise<ShopAnalytic | null> | ShopAnalytic | null;
  shop: Promise<ShopAnalytic | null> | ShopAnalytic | null;
}

type Carts = {
  cart: Awaited<AnalyticsProviderProps['cart']>;
  prevCart: Awaited<AnalyticsProviderProps['cart']>;
}

type AnalyticsContextValue = {
  canTrack: NonNullable<AnalyticsProviderProps['canTrack']>;
  cart: Awaited<AnalyticsProviderProps['cart']>;
  customPayload: AnalyticsProviderProps['customPayload'];
  prevCart: Awaited<AnalyticsProviderProps['cart']>;
  publish: typeof publish;
  setCarts: React.Dispatch<React.SetStateAction<Carts>>;
  shop: Awaited<AnalyticsProviderProps['shop']>;
  subscribe: typeof subscribe;
}

export const defaultAnalyticsContext: AnalyticsContextValue = {
  canTrack: () => false,
  cart: null,
  customPayload: {},
  prevCart: null,
  publish: () => {},
  setCarts: () => ({cart: null, prevCart: null}),
  shop: null,
  subscribe: () => {},
};

const AnalyticsContext = createContext<AnalyticsContextValue>(
  defaultAnalyticsContext,
);

const subscribers = new Map<string, Map<string, (payload: EventPayloads) => void>>();

// Overload functions for each subscribe event
function subscribe(
  event: typeof AnalyticsEvent.PAGE_VIEWED,
  callback: (payload: PageViewPayload) => void
): void;

function subscribe(
  event: typeof AnalyticsEvent.PRODUCT_VIEWED,
  callback: (payload: ProductViewPayload) => void
): void;

function subscribe(
  event: typeof AnalyticsEvent.COLLECTION_VIEWED,
  callback: (payload: CollectionViewPayload) => void
): void;

function subscribe(
  event: typeof AnalyticsEvent.CART_VIEWED,
  callback: (payload: CartViewPayload) => void
): void;

function subscribe(
  event: typeof AnalyticsEvent.CART_UPDATED,
  callback: (payload: CartUpdatePayload) => void
): void;

function subscribe(
  event: typeof AnalyticsEvent.CUSTOM_EVENT,
  callback: (payload: CustomEventPayload) => void
): void;

function subscribe(
  event: any,
  callback: any
) {
  if (!subscribers.has(event)) {
    subscribers.set(event, new Map());
  }
  subscribers.get(event)?.set(callback.toString(), callback);
}

function publish(event: typeof AnalyticsEvent.PAGE_VIEWED, payload: PageViewPayload): void;
function publish(event: typeof AnalyticsEvent.PRODUCT_VIEWED, payload: ProductViewPayload): void;
function publish(event: typeof AnalyticsEvent.COLLECTION_VIEWED, payload: CollectionViewPayload): void;
function publish(event: typeof AnalyticsEvent.CART_VIEWED, payload: CartViewPayload): void;
function publish(event: typeof AnalyticsEvent.CART_UPDATED, payload: CartUpdatePayload): void;
function publish(event: typeof AnalyticsEvent.CUSTOM_EVENT, payload: OtherData): void;
function publish(event: any,  payload: any): void {
  (subscribers.get(event) ?? new Map()).forEach((callback) => {
    try {
      callback(payload);
    } catch (error) {
      if (typeof error === 'object' && error instanceof Error) {
        console.error('Analytics publish error', error.message);
      } else {
        console.error('Analytics publish error', error);
      }
    }
  });
}

// This functions attempts to automatically determine if the user can be tracked if the
// customer privacy API is available. If not, it will default to false.
function shopifyCanTrack() {
  if (
    typeof window !== 'undefined' &&
    typeof window?.Shopify === 'object' &&
    typeof window?.Shopify?.customerPrivacy === 'object' &&
    typeof window?.Shopify?.customerPrivacy?.userCanBeTracked === 'function'
  ) {
    return window.Shopify.customerPrivacy.userCanBeTracked();
  }
  return false;
}

export function AnalyticsProvider({
  children,
  canTrack: customCanTrack,
  customPayload = {},
  cart: currentCart,
  shop: shopProp = null,
}: AnalyticsProviderProps): JSX.Element {
  const listenerSet = useRef(false);
  const {shop} = useShopAnalytics(shopProp);
  const [consentLoaded, setConsentLoaded] = useState(customCanTrack ? true : false);
  const [carts, setCarts] = useState<Carts>({cart: null, prevCart: null});
  const [canTrack, setCanTrack] = useState(customCanTrack ? () => customCanTrack : () => shopifyCanTrack);

  useEffect(() => {
    if (listenerSet.current) return;
    listenerSet.current = true;

    // Listen for the customerPrivacyApiLoaded event dispatched by the
    // useCustomerPrivacy hook
    document.addEventListener('customerPrivacyApiLoaded', (event) => {;
      if (!event.detail) {
        setConsentLoaded(false);
        setCanTrack(() => () => false);
      } else {
        setConsentLoaded(event.detail);
        setCanTrack(() => shopifyCanTrack);
      }
    })
  }, [setConsentLoaded, setCanTrack]);

  const value = useMemo<AnalyticsContextValue>(() => ({
    canTrack,
    ...carts,
    customPayload,
    publish,
    setCarts,
    shop,
    subscribe
  }), [setCarts, consentLoaded, canTrack, JSON.stringify(canTrack), carts.cart?.updatedAt, carts.prevCart, publish, subscribe, customPayload, shop]);

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
      {shop && <AnalyticsView type="page_viewed" />}
      {currentCart && <CartAnalytics cart={currentCart} />}
      <ShopifyAnalytics />
    </AnalyticsContext.Provider>
  );
};

export function useAnalyticsProvider(): AnalyticsContextValue {
  const analyticsContext = useContext(AnalyticsContext);
  if (!analyticsContext) {
    throw new Error(`'useAnalyticsProvider()' must be a descendent of <AnalyticsProvider/>`);
  }
  return analyticsContext;
}

export function CartAnalytics({cart: currentCart}: {cart: AnalyticsProviderProps['cart']}) {
  const {publish, shop, customPayload, canTrack, cart, prevCart, setCarts} = useAnalyticsProvider();
  const lastEventId = useRef<string | null>(null);

  // resolve the cart that could have been deferred
  useEffect(() => {
    if (!currentCart) return;
    Promise.resolve(currentCart).then((updatedCart) => {
      setCarts(({cart, prevCart}: Carts) => {
        if (updatedCart?.updatedAt !== cart?.updatedAt) return {cart: updatedCart, prevCart: cart};
        return {cart, prevCart};
      })
    })
    return () => {};
  }, [setCarts, currentCart]);


  useEffect(() => {
    if (!cart || !cart?.updatedAt) return;
    if (cart?.updatedAt === prevCart?.updatedAt) return;

    const payload: CartUpdatePayload = {
      eventTimestamp: Date.now(),
      cart,
      prevCart,
      shop,
      customPayload,
    };

    // prevent duplicate events
    if (cart.updatedAt === lastEventId.current) return;
    lastEventId.current = cart.updatedAt;

    publish('cart_updated', payload)
  }, [cart, prevCart, setCarts, publish, shop, customPayload, canTrack]);

  return null;
}

/**
 * A hook that resolves the shop analytics that could have been deferred
 * and returns the shop analytics.
 */
function useShopAnalytics(shopProp: AnalyticsProviderProps['shop']): {shop: ShopAnalytic | null} {
  const [shop, setShop] = useState<Awaited<AnalyticsProviderProps['shop']>>(null);

  // resolve the shop analytics that could have been deferred
  useEffect(() => {
    Promise.resolve(shopProp).then(setShop);
    return () => {};
  }, [setShop, shopProp]);

  return {shop};
}
