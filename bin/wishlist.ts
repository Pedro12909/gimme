#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { WishlistStack } from "../lib/wishlist-stack";
import { CertificateStack, SiteDomain } from "../lib/certificate-stack";

const app = new cdk.App();
const account = process.env.CDK_DEFAULT_ACCOUNT;

const site: SiteDomain = {
  domainName: "gimme.rtemis.dev",
  hostedZoneId: "Z0121169338M4CQ3XHQQG",
  zoneName: "rtemis.dev",
};

const certificateStack = new CertificateStack(app, "WishlistCertificateStack", {
  env: { account, region: "us-east-1" },
  crossRegionReferences: true,
  site,
});

new WishlistStack(app, "WishlistStack", {
  env: { account, region: "eu-west-2" },
  crossRegionReferences: true,
  site: { ...site, certificate: certificateStack.certificate },
});
