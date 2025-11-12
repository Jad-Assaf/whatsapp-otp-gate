/**
 * Minimal Shopify Storefront API client. Only exposes a single function to
 * fetch the checkout URL of a cart. Requires SHOPIFY_STOREFRONT_API_URL
 * and SHOPIFY_STOREFRONT_API_TOKEN to be defined in the environment.
 */

const API_URL = process.env.SHOPIFY_STOREFRONT_API_URL || '';
const API_TOKEN = process.env.SHOPIFY_STOREFRONT_API_TOKEN || '';

if (!API_URL || !API_TOKEN) {
  // eslint-disable-next-line no-console
  console.warn('Shopify Storefront API environment variables are not fully configured.');
}

interface CartResponse {
  data?: {
    cart?: {
      checkoutUrl: string;
    } | null;
  };
  errors?: any;
}

/**
 * Retrieve the checkout URL for a given cart ID via Shopify's Storefront API.
 *
 * @param cartId The GraphQL ID of the cart (e.g. gid://shopify/Cart/123)
 * @throws if the API call fails or returns an error
 */
export async function getCheckoutUrl(cartId: string): Promise<string> {
  const query = `query GetCart($id: ID!) { cart(id: $id) { checkoutUrl } }`;
  const body = JSON.stringify({ query, variables: { id: cartId } });
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Shopify-Storefront-Access-Token': API_TOKEN
  };
  const res = await fetch(API_URL, {
    method: 'POST',
    headers,
    body,
    // ensure we don't revalidate caches implicitly
    cache: 'no-store'
  });
  if (!res.ok) {
    throw new Error(`Shopify API request failed with status ${res.status}`);
  }
  const json = (await res.json()) as CartResponse;
  if (json.errors) {
    throw new Error(`Shopify API returned errors: ${JSON.stringify(json.errors)}`);
  }
  const checkoutUrl = json.data?.cart?.checkoutUrl;
  if (!checkoutUrl) {
    throw new Error('Checkout URL not found');
  }
  return checkoutUrl;
}