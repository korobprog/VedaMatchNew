/**
 * Подпись строки из Open Food Facts. Её требует лицензия ODbL, и она же
 * говорит человеку, откуда состав: строку писали не мы и не он.
 */
export function OffAttribution({ barcode }: { barcode: string }) {
  return (
    <p className="mt-2 text-xs text-text-1">
      Состав из{" "}
      <a
        href={`https://world.openfoodfacts.org/product/${barcode}`}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        Open Food Facts
      </a>
      , лицензия{" "}
      <a
        href="https://opendatacommons.org/licenses/odbl/1-0/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        ODbL
      </a>
    </p>
  );
}
