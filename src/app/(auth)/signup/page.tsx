import Link from "next/link";

import { SignupForm } from "@/app/(auth)/signup/signup-form";

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create your firm workspace</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;ll start as the firm admin. You can invite paralegals and attorneys after sign in.
        </p>
      </div>
      <SignupForm />
      <div className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </div>
    </div>
  );
}
