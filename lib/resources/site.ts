import * as cdk from "aws-cdk-lib/core";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import * as fs from "node:fs";
import * as path from "node:path";
import { SiteDomain } from "../certificate-stack";

const FRONTEND_DIST = path.join(__dirname, "../../frontend/dist");

export type Site = {
  siteBucket: s3.Bucket;
  distribution: cloudfront.Distribution;
  siteUrl: string;
};

// Frontend hosting: private S3 bucket behind CloudFront, on the custom domain
export function createSite(
  stack: cdk.Stack,
  site: SiteDomain & { certificate: acm.ICertificate },
): Site {
  // Only readable by CloudFront
  const siteBucket = new s3.Bucket(stack, "SiteBucket", {
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    enforceSSL: true,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    autoDeleteObjects: true,
  });

  // App routes like /s/<token> aren't files, so serve index.html and let the router handle them.
  // Real files (anything with an extension) still 404 properly when missing.
  const spaRouting = new cloudfront.Function(stack, "SpaRouting", {
    runtime: cloudfront.FunctionRuntime.JS_2_0,
    code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  if (!request.uri.includes(".")) {
    request.uri = "/index.html";
  }
  return request;
}`),
  });

  const distribution = new cloudfront.Distribution(stack, "SiteDistribution", {
    domainNames: [site.domainName],
    certificate: site.certificate,
    defaultRootObject: "index.html",
    priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    defaultBehavior: {
      origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      // HSTS, nosniff, frame denial, and a referrer policy that keeps share tokens out of outbound links
      responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      functionAssociations: [
        {
          function: spaRouting,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        },
      ],
    },
  });

  const zone = route53.HostedZone.fromHostedZoneAttributes(stack, "Zone", {
    hostedZoneId: site.hostedZoneId,
    zoneName: site.zoneName,
  });
  const recordName = site.domainName.replace(`.${site.zoneName}`, "");
  const aliasTarget = route53.RecordTarget.fromAlias(
    new CloudFrontTarget(distribution),
  );
  new route53.ARecord(stack, "SiteAliasIpv4", {
    zone,
    recordName,
    target: aliasTarget,
  });
  new route53.AaaaRecord(stack, "SiteAliasIpv6", {
    zone,
    recordName,
    target: aliasTarget,
  });

  return { siteBucket, distribution, siteUrl: `https://${site.domainName}` };
}

// Uploads the built frontend and writes the runtime config.
// The build must exist first: npm run deploy builds it, then deploys.
export function deploySite(
  stack: cdk.Stack,
  { siteBucket, distribution }: Site,
  config: { apiUrl: string; userPoolId: string; userPoolClientId: string },
) {
  if (!fs.existsSync(path.join(FRONTEND_DIST, "index.html"))) {
    throw new Error(
      "frontend/dist not found. Build it first: npm run build --prefix frontend",
    );
  }

  // Hashed bundles never change, so browsers can cache them for a year
  const assetsDeployment = new s3deploy.BucketDeployment(
    stack,
    "DeploySiteAssets",
    {
      destinationBucket: siteBucket,
      sources: [
        s3deploy.Source.asset(FRONTEND_DIST, {
          exclude: ["index.html", "favicon.svg", "config.json"],
        }),
      ],
      cacheControl: [
        s3deploy.CacheControl.fromString("public, max-age=31536000, immutable"),
      ],
      // Keep older bundles so people with an older index.html open can still load them
      prune: false,
    },
  );

  // The entry page and runtime config must always be fresh, so they're revalidated on every load
  const shellDeployment = new s3deploy.BucketDeployment(
    stack,
    "DeploySiteShell",
    {
      destinationBucket: siteBucket,
      sources: [
        s3deploy.Source.asset(FRONTEND_DIST, {
          exclude: ["*", "!index.html", "!favicon.svg"],
        }),
        s3deploy.Source.jsonData("config.json", config),
      ],
      cacheControl: [s3deploy.CacheControl.fromString("no-cache")],
      prune: false,
      distribution,
      distributionPaths: ["/index.html", "/favicon.svg", "/config.json"],
    },
  );
  // New bundles must be in place before the index.html that references them
  shellDeployment.node.addDependency(assetsDeployment);
}
