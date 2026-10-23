/** Subtle developer credit — shown only on the sign-in page. */
export default function DevCredit() {
  return (
    <a href="https://paramistech.ir/" target="_blank" rel="noopener noreferrer" aria-label="طراحی و توسعه: پارامیس تک"
      className="group inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground">
      <span>طراحی و توسعه</span>
      <span className="h-1 w-1 rounded-full bg-sidebar-primary/70 transition-transform group-hover:scale-150" />
      <span className="font-semibold tracking-tight underline-offset-4 group-hover:text-primary group-hover:underline">پارامیس تک</span>
    </a>
  );
}
