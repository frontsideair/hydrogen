import {json, redirect, type LoaderArgs} from '@shopify/remix-oxygen';
import {useLoaderData, Link} from '@remix-run/react';
import {
  Pagination__unstable as Pagination,
  getPaginationVariables__unstable as getPaginationVariables,
  Image,
} from '@shopify/hydrogen';
import {ProductItemFragment} from 'storefrontapi.generated';

// TODO: add SEO

export async function loader({request, params, context}: LoaderArgs) {
  const {handle} = params;
  const {storefront} = context;
  const paginationVariables = getPaginationVariables(request, {
    pageBy: 8,
  });

  if (!handle) {
    return redirect('/collections');
  }

  const {collection} = await storefront.query(COLLECTION_QUERY, {
    variables: {handle, ...paginationVariables},
  });

  if (!collection) {
    throw new Response(`Collection ${handle} not found`, {
      status: 404,
    });
  }
  return json({collection});
}

export default function Collection() {
  const {collection} = useLoaderData<typeof loader>();

  return (
    <section className="collection">
      <h1>{collection.title}</h1>
      <p style={{maxWidth: '370px'}}>{collection.description}</p>
      <br />
      <div className="collection-grid">
        <Pagination connection={collection.products}>
          {({nodes, isLoading, PreviousLink, NextLink}) => (
            <>
              <PreviousLink>
                {isLoading ? (
                  'Loading...'
                ) : (
                  <span>
                    <mark>↑</mark> Load previous
                  </span>
                )}
              </PreviousLink>
              <ProductsGrid products={nodes} />
              <NextLink>
                {isLoading ? (
                  'Loading...'
                ) : (
                  <span>
                    Load more <mark>↓</mark>
                  </span>
                )}
              </NextLink>
            </>
          )}
        </Pagination>
      </div>
    </section>
  );
}

function ProductsGrid({products}: {products: ProductItemFragment[]}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gridGap: '1rem',
      }}
    >
      {products.map((product, index) => {
        const variant = product.variants.nodes[0];
        const variantParams = new URLSearchParams(
          variant.selectedOptions.reduce((param, op) => {
            return {...param, [op.name]: op.value};
          }, {}),
        ).toString();
        const url = `/products/${product.handle}?${variantParams}`;
        return (
          <Link key={product.id} to={url} prefetch="intent">
            {/* TODO: @ben welp with sizes and url transform? */}
            {product.featuredImage && (
              <Image
                alt={product.featuredImage.altText || product.title}
                aspectRatio={`${product.featuredImage.width}/${product.featuredImage.height}`}
                data={product.featuredImage}
                loading={index < 8 ? 'eager' : undefined}
                sizes="(min-width: 45em) 400px, 100vw"
                style={{width: '100%', height: 'auto'}}
              />
            )}
            <h5>{product.title}</h5>
          </Link>
        );
      })}
    </div>
  );
}

const MONEY_FRAGMENT = `#graphql
  fragment MoneyProductItem on MoneyV2 {
    amount
    currencyCode
  }
` as const;

const PRODUCT_ITEM_FRAGMENT = `#graphql
  fragment ProductItem on Product {
    id
    handle
    title
    featuredImage {
      id
      altText
      ## url: transformedSrc(maxWidth: 800, maxHeight: 800, crop: CENTER)
      url
      width
      height
    }
    priceRange {
      minVariantPrice {
        ...MoneyProductItem
      }
      maxVariantPrice {
        ...MoneyProductItem
      }
    }
    variants(first: 1) {
      nodes {
        selectedOptions {
          name
          value
        }
      }
    }
  }
  ${MONEY_FRAGMENT}
` as const;

// NOTE: https://shopify.dev/docs/api/storefront/2022-04/objects/collection
const COLLECTION_QUERY = `#graphql
  query Collection(
    $handle: String!
    $country: CountryCode
    $language: LanguageCode
    $first: Int
    $last: Int
    $startCursor: String
    $endCursor: String
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      products(
        first: $first,
        last: $last,
        before: $startCursor,
        after: $endCursor
      ) {
        nodes {
          ...ProductItem
        }
        pageInfo {
          hasPreviousPage
          hasNextPage
          hasNextPage
          endCursor
        }
      }
    }
  }
  ${PRODUCT_ITEM_FRAGMENT}
` as const;