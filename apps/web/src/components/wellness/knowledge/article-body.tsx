import { parseArticleBody, parseInline } from "./knowledge-text";

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, index) => {
        if (part.type === "strong") {
          return (
            <strong key={index} className="font-semibold text-text-0">
              {part.text}
            </strong>
          );
        }
        if (part.type === "link") {
          return (
            <a
              key={index}
              href={part.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-cyan underline underline-offset-2"
            >
              {part.text}
            </a>
          );
        }
        return <span key={index}>{part.text}</span>;
      })}
    </>
  );
}

/** Текст статьи «Знаний»: разметка собирается в элементы, HTML не вставляется. */
export function ArticleBody({ body }: { body: string }) {
  return (
    <div className="space-y-4 text-base leading-relaxed text-text-1">
      {parseArticleBody(body).map((block, index) => {
        if (block.type === "heading") {
          const Tag = `h${block.level}` as "h2" | "h3" | "h4";
          return (
            <Tag
              key={index}
              className={`font-display font-bold text-text-0 ${
                block.level === 2 ? "text-xl" : "text-lg"
              }`}
            >
              <Inline text={block.text} />
            </Tag>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Inline text={item} />
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote
              key={index}
              className="border-l-2 border-magenta pl-4 italic"
            >
              <Inline text={block.text} />
            </blockquote>
          );
        }
        return (
          <p key={index}>
            <Inline text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
