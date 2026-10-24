import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-bold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper hover:bg-ink/90",
        yes: "bg-yes text-white hover:bg-yes/90",
        no: "bg-no text-white hover:bg-no/90",
        outline: "border border-rule bg-paper-raised hover:bg-paper",
        ghost: "hover:bg-paper-raised",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
