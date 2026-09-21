import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-[250ms] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90 hover:-translate-y-1 hover:shadow-soft-lg",
        accent: "bg-accent text-accent-foreground shadow-soft hover:bg-accent/90",
        destructive: "bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90",
        outline: "border border-border bg-transparent hover:bg-secondary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "hover:bg-secondary/70",
        link: "text-primary underline-offset-4 hover:underline rounded-none",
      },
      size: {
        default: "h-11 px-6 py-2 has-[>svg]:px-5",
        sm: "h-9 rounded-full px-4 has-[>svg]:px-3.5 text-[0.8rem]",
        lg: "h-12 rounded-full px-8 has-[>svg]:px-6 text-base",
        icon: "size-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
