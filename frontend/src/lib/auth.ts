import { Amplify } from "aws-amplify";
import {
  autoSignIn,
  confirmSignIn,
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  resendSignUpCode,
  signIn,
  signOut,
  signUp,
} from "aws-amplify/auth";
import { getConfig } from "@/config";

// Configured when this module first loads, so only pages that need sign-in pull in Amplify
const { userPoolId, userPoolClientId } = getConfig();
Amplify.configure({
  Auth: {
    Cognito: { userPoolId, userPoolClientId, loginWith: { email: true } },
  },
});

// New and returning users go through the same "email, then code" flow.
// "signIn" codes come from passwordless sign-in, "signUp" codes from account verification.
export type CodeMode = "signIn" | "signUp";

const signInWithEmailCode = (email: string) =>
  signIn({
    username: email,
    options: { authFlowType: "USER_AUTH", preferredChallenge: "EMAIL_OTP" },
  });

export async function sendCode(email: string): Promise<CodeMode> {
  try {
    const { nextStep } = await signInWithEmailCode(email);

    if (nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_EMAIL_CODE") {
      return "signIn";
    }
    if (nextStep.signInStep === "CONFIRM_SIGN_UP") {
      // Started signing up before but never entered the code
      await resendSignUpCode({ username: email });
      return "signUp";
    }

    throw new Error(`Unexpected sign-in step: ${nextStep.signInStep}`);
  } catch (err) {
    if (!(err instanceof Error) || err.name !== "UserNotFoundException") {
      throw err;
    }

    try {
      await signUp({
        username: email,
        options: {
          userAttributes: { email },
          autoSignIn: { authFlowType: "USER_AUTH" },
        },
      });
    } catch (signUpErr) {
      // Self sign-up is turned off in the user pool, so unknown emails can't create an account
      if (
        signUpErr instanceof Error &&
        signUpErr.name === "NotAuthorizedException"
      ) {
        throw new NotInvited();
      }
      throw signUpErr;
    }
    return "signUp";
  }
}

export async function resendCode(email: string, mode: CodeMode) {
  if (mode === "signUp") {
    await resendSignUpCode({ username: email });
  } else {
    await signInWithEmailCode(email);
  }
}

// Thrown when an email has no account and sign-up is closed (invite-only)
export class NotInvited extends Error {
  constructor() {
    super("This email hasn't been invited.");
    this.name = "NotInvited";
  }
}

// Thrown when a verified sign-up still needs a sign-in code, which has just been emailed
export class NeedsSignInCode extends Error {
  constructor() {
    super("Verified. A sign-in code has been sent.");
    this.name = "NeedsSignInCode";
  }
}

export async function confirmCode(email: string, mode: CodeMode, code: string) {
  if (mode === "signIn") {
    const { nextStep } = await confirmSignIn({ challengeResponse: code });
    if (nextStep.signInStep !== "DONE") {
      throw new Error(`Unexpected sign-in step: ${nextStep.signInStep}`);
    }
    return;
  }

  const { nextStep } = await confirmSignUp({
    username: email,
    confirmationCode: code,
  });

  if (nextStep.signUpStep === "COMPLETE_AUTO_SIGN_IN") {
    await autoSignIn();
  } else {
    // Auto sign-in isn't available (sign-up began in another session), so fall back to a sign-in code
    await signInWithEmailCode(email);
    throw new NeedsSignInCode();
  }
}

export async function currentUser() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

export async function accessToken() {
  const { tokens } = await fetchAuthSession();
  return tokens?.accessToken.toString();
}

export { signOut };
