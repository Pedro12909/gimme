import type { CustomMessageTriggerEvent } from "aws-lambda";

// Cognito calls this before sending any email, and sends the subject and body it returns
// instead of its defaults. It's the only way to reword the passwordless sign-in code email.
// Cognito swaps {####} for the code and {username} for the email address after this returns.

const siteUrl = process.env["SITE_URL"] ?? "";

// Plain, greyscale HTML with inline styles, since email clients ignore stylesheets
function layout(heading: string, body: string, footer: string) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#171717;max-width:420px;margin:0 auto;padding:32px 24px">
<p style="margin:0 0 32px;font-size:18px;font-weight:600;letter-spacing:-0.02em">gimme</p>
<p style="margin:0 0 16px;font-size:20px;font-weight:600">${heading}</p>
${body}
<p style="margin:32px 0 0;font-size:13px;color:#737373">${footer}</p>
</div>`;
}

const code = (param: string) =>
  `<p style="margin:0 0 16px;font-size:32px;font-weight:600;letter-spacing:0.15em;font-family:ui-monospace,Menlo,monospace">${param}</p>`;

const text = (content: string) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${content}</p>`;

export const handler = async (event: CustomMessageTriggerEvent) => {
  const { codeParameter, usernameParameter } = event.request;
  const ignore = "If you didn't ask for this, you can ignore this email.";

  switch (event.triggerSource) {
    // Passwordless sign-in
    case "CustomMessage_Authentication":
      event.response.emailSubject = "Your gimme sign-in code";
      event.response.emailMessage = layout(
        "Your sign-in code",
        code(codeParameter) + text("It expires in 10 minutes."),
        ignore,
      );
      break;

    // Confirming the email address of a new or changed account
    case "CustomMessage_SignUp":
    case "CustomMessage_ResendCode":
    case "CustomMessage_UpdateUserAttribute":
    case "CustomMessage_VerifyUserAttribute":
      event.response.emailSubject = "Confirm your email for gimme";
      event.response.emailMessage = layout(
        "Confirm your email",
        code(codeParameter) +
          text("Enter this code in gimme to confirm your email address."),
        ignore,
      );
      break;

    // Sent when an admin creates the account (invite-only)
    case "CustomMessage_AdminCreateUser":
      event.response.emailSubject = "You're invited to gimme";
      event.response.emailMessage = layout(
        "You're invited to gimme",
        text(
          "Make wishlists from any shop and share them with friends and family. They claim gifts, and you never see who got what.",
        ) +
          text(
            `Sign in at <a href="${siteUrl}" style="color:#171717">${siteUrl.replace("https://", "")}</a> with ${usernameParameter}. We'll email you a code, so there's no password to remember.`,
          ),
        "You got this because someone added your email to gimme.",
      );
      break;
  }

  // Other triggers (e.g. forgot password, unused here) keep Cognito's default message
  return event;
};
