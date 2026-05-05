"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserSupabase } from "@/lib/supabase/client";

const schema = z.object({
  fullName: z.string().min(2, "Enter your full name"),
  firmName: z.string().min(2, "Enter your firm name"),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
type FormValues = z.infer<typeof schema>;

export function SignupForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setPending(true);
    try {
      const supabase = getBrowserSupabase();
      // Send the confirmation email back to our callback route on whichever
      // origin the user signed up from. This avoids the "redirected to
      // localhost:3000" problem when the Supabase project's Site URL points
      // somewhere else, and ensures the PKCE `code` lands on a route that
      // actually exchanges it for a session.
      const emailRedirectTo = `${window.location.origin}/auth/callback?next=/dashboard`;
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          emailRedirectTo,
          data: { full_name: values.fullName, firm_name: values.firmName },
        },
      });
      if (error) {
        toast.error(error.message);
        setPending(false);
        return;
      }

      // Email-confirmation projects return a user with no session. The
      // workspace is created lazily after the user clicks the email link
      // and lands on /onboarding (which the dashboard layout redirects to
      // when no profile yet exists for the authenticated user).
      if (!data.session) {
        toast.success("Check your email to confirm your account.");
        router.replace("/login");
        return;
      }

      const res = await fetch("/api/onboarding", {
        method: "POST",
        body: JSON.stringify({ fullName: values.fullName, firmName: values.firmName }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const text = await res.text();
        toast.error(text || "Could not finish setup");
        setPending(false);
        return;
      }

      toast.success("Workspace created");
      // Hard navigation so the just-set Supabase auth cookies are sent on the
      // next request and the protected /dashboard route renders against the
      // fresh session instead of bouncing through middleware.
      window.location.assign("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Your name</Label>
          <Input id="fullName" autoComplete="name" {...register("fullName")} />
          {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="firmName">Firm name</Label>
          <Input id="firmName" autoComplete="organization" {...register("firmName")} />
          {errors.firmName && <p className="text-xs text-destructive">{errors.firmName.message}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} Create workspace
      </Button>
    </form>
  );
}
