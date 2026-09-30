import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Safe Markdown renderer. Raw HTML is skipped, unsafe URL protocols are removed
 * by react-markdown's default URL transform, and external links open safely.
 */
export function Markdown({ children, className, inline = false, compact = false }: { children: string; className?: string; inline?: boolean; compact?: boolean }) {
  return (
    <div className={cn(inline ? "[&>p]:inline" : compact ? "prose-compact" : "prose-content", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children: linkChildren }) => {
            const external = !!href && /^https?:\/\//.test(href);
            return (
              <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
                {linkChildren}
                {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
              </a>
            );
          },
          img: () => null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
