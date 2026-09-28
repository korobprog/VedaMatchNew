import { Button } from "@/components/ui/button";

/**
 * Низ окон «Линия» (домик) и «Самоидентификация» (отпечаток) у материала
 * администратора (VED-632): «Сохранить» и ошибка под ней. У участника низа
 * нет: пояснение «что показывать, выбирается в фильтрах материалов на
 * главной» заказчик убрал как лишнее (VED-635).
 */
export function MaterialMarksFooter({
  pending,
  error,
  onSave,
}: {
  pending: boolean;
  error: string | null;
  onSave: () => void;
}) {
  return (
    <div className="mt-2 border-t border-glass-brd px-1 pt-2">
      <Button
        type="button"
        loading={pending}
        onClick={onSave}
        className="min-h-11 w-full"
      >
        Сохранить
      </Button>
      {error && (
        <p role="alert" className="px-2 pt-2 text-xs text-magenta">
          {error}
        </p>
      )}
    </div>
  );
}
