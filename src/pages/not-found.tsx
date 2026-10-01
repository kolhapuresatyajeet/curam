import { AppButton } from '@/components/shared/ui';

export default function NotFound() {
  return (
    <div className="fade-in flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="font-mono text-[42px] font-bold tracking-[-.04em] text-teal-700">404</div>
      <h1 className="mt-1 text-[19px] font-semibold tracking-[-.02em] text-slate-800">Page not found</h1>
      <p className="mt-2 max-w-[300px] text-xs leading-5 text-slate-500">
        This page doesn't exist in Cúram. Use the navigation to return to your practice diary.
      </p>
      <div className="mt-4">
        <AppButton variant="primary" size="sm" onClick={() => (window.location.href = '/')}>
          Back to dashboard
        </AppButton>
      </div>
    </div>
  );
}
