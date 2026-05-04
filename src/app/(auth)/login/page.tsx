import Link from "next/link";
import { Suspense } from "react";

import { LoginForm } from "@/app/(auth)/login/login-form";

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">Welcome back. Sign in to your firm workspace.</p>
      </div>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-secondary/40" />}>
        <LoginForm />
      </Suspense>
      <div className="text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create one
        </Link>
      </div>
      <div className="text-sm text-muted-foreground">
        <Link href="/forgot-password" className="hover:underline">
          Forgot password?
        </Link>
      </div>
    </div>
  );
}
