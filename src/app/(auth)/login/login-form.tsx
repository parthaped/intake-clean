"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
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
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const params = useSearchParams();
  const [pending, setPending] = useState(false);

  // Surface errors that the /auth/callback route attaches when an email link
  // can't be redeemed (expired code, missing code, supabase-side failure).
  useEffect(() => {
    const errorMessage = params.get("error");
    if (errorMessage) toast.error(errorMessage);
  }, [params]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setPending(true);
    try {
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.signInWithPassword(values);
      if (error) {
        toast.error(error.message);
        setPending(false);
        return;
      }
      toast.success("Signed in");

      // Validate `next` is a same-origin path so the form can't be coerced
      // into redirecting somewhere unsafe.
      const requestedNext = params.get("next");
      const target = requestedNext && requestedNext.startsWith("/") ? requestedNext : "/dashboard";

      // Use a full reload rather than `router.replace`. The auth cookies that
      // `signInWithPassword` just wrote need to ride the next request, and
      // a hard navigation guarantees that — soft navigations have raced our
      // middleware in the past and bounced the user straight back to /login,
      // which is what produced the "forever loading" symptom on the spinner.
      window.location.assign(target);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
      </Button>
    </form>
  );
}
