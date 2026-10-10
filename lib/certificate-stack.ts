import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";

export type SiteDomain = {
  domainName: string;
  hostedZoneId: string;
  zoneName: string;
};

// CloudFront only accepts certificates from us-east-1, so this stack lives there
// and hands the certificate to the main stack through a cross-region reference.
export class CertificateStack extends cdk.Stack {
  readonly certificate: acm.ICertificate;

  constructor(
    scope: Construct,
    id: string,
    props: cdk.StackProps & { site: SiteDomain },
  ) {
    super(scope, id, props);

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
      hostedZoneId: props.site.hostedZoneId,
      zoneName: props.site.zoneName,
    });

    this.certificate = new acm.Certificate(this, "SiteCertificate", {
      domainName: props.site.domainName,
      validation: acm.CertificateValidation.fromDns(zone),
    });
  }
}
