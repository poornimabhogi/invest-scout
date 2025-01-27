import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        toast({
          title: "Success!",
          description: "Please check your email to verify your account.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate('/');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    const guestEmail = 'guest.user@example.com';  // Changed to a more valid email format
    const guestPassword = 'guestpassword123';

    try {
      // First try to sign in
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: guestEmail,
        password: guestPassword,
      });

      if (signInError) {
        // If sign in fails, try to create the guest account
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: guestEmail,
          password: guestPassword,
        });

        if (signUpError) {
          console.error('Guest signup error:', signUpError);
          throw signUpError;
        }

        // After creating the account, sign in
        const { error: finalSignInError } = await supabase.auth.signInWithPassword({
          email: guestEmail,
          password: guestPassword,
        });

        if (finalSignInError) throw finalSignInError;
      }

      toast({
        title: "Success!",
        description: "Logged in as guest",
      });
      navigate('/');
    } catch (error: any) {
      console.error('Guest login error:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-trading-background p-4">
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-lg shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-trading-primary">
            {isSignUp ? 'Create an account' : 'Welcome back'}
          </h2>
          <p className="mt-2 text-sm text-trading-secondary">
            {isSignUp
              ? 'Sign up to start trading'
              : 'Please sign in to your account'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your email"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading
              ? 'Loading...'
              : isSignUp
              ? 'Sign Up'
              : 'Sign In'}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGuestLogin}
            disabled={isLoading}
          >
            Continue as Guest
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-trading-primary hover:underline"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Auth;