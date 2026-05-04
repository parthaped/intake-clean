import Link from "next/link";

import { ForgotPasswordForm } from "@/app/(auth)/forgot-password/forgot-form";

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          Enter the email associated with your account and we&apos;ll send you a reset link.
        </p>
      </div>
      <ForgotPasswordForm />
      <div className="text-sm text-muted-foreground">
        <Link href="/login" className="hover:underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
