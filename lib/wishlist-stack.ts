import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { CfnOutput } from "aws-cdk-lib/core";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { SiteDomain } from "./certificate-stack";
import { createApi } from "./resources/api";
import { createAuth } from "./resources/auth";
import { createClaimsCleanup } from "./resources/claims-cleanup";
import { createSite, deploySite } from "./resources/site";
import { createTables } from "./resources/tables";

// Each helper creates its resources directly in this stack (not in a nested construct),
// so CloudFormation logical IDs stay stable and nothing gets replaced.
export class WishlistStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: cdk.StackProps & {
      site: SiteDomain & { certificate: acm.ICertificate };
    },
  ) {
    super(scope, id, props);

    const tables = createTables(this);
    const site = createSite(this, props.site);
    const auth = createAuth(this, site.siteUrl);

    const { httpApi } = createApi(this, {
      auth,
      tables,
      allowedOrigins: [site.siteUrl, "http://localhost:5173"],
    });

    createClaimsCleanup(this, tables);

    deploySite(this, site, {
      apiUrl: httpApi.apiEndpoint,
      userPoolId: auth.userPool.userPoolId,
      userPoolClientId: auth.userPoolClient.userPoolClientId,
    });

    new CfnOutput(this, "SiteUrl", {
      value: site.siteUrl,
    });
    new CfnOutput(this, "WishlistAPIUrl", {
      value: httpApi.apiEndpoint,
    });
    new CfnOutput(this, "Pool ID", {
      value: auth.userPool.userPoolId,
    });
    new CfnOutput(this, "Pool Client ID", {
      value: auth.userPoolClient.userPoolClientId,
    });
  }
}
