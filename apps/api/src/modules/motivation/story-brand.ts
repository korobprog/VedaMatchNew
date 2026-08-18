/**
 * Знак VedaMatch для подписи на сторис и роликах.
 *
 * Лежит здесь строкой, а не файлом, намеренно. Подпись рисует API, а картинка
 * бренда живёт в apps/web/public/brand — за границей приложения. Ни
 * nest-cli.json, ни Dockerfile статику в dist не возят, поэтому файл молча не
 * доехал бы до образа, и ролики уходили бы без знака. Ровно так уже вели себя
 * пропавшие шрифты и ffmpeg: сбой видно только на готовом кадре.
 *
 * Исходник — apps/web/public/brand/logo-dark.png (белый вариант для тёмного
 * фона), уменьшенный до 202x152 и пережатый в палитру: 7.7 КБ вместо 167.
 * Размер вдвое больше отрисовываемого — чтобы знак не мылился.
 */
export const BRAND_LOGO_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAMoAAACYCAMAAACS/YZmAAADAFBMVEVMaXH28f/p4//18f/17/9aTcb18P/18P/9//718P/2' +
  '8P/28f/p5//v7f/v6v/x7f0HHT/o4/n18P8IIUfz7v8KJU328f/w6v8LK10QNXHy7f7z7v/07//18f/28P/28f/18P/18P8K' +
  'KFT28f/w6vr18P/08P/28P/08P/18P/18f/18P/07//07//07//18P/18P/18P/07//38v/18P/z7v/08P/28f8NMGcvZrb1' +
  '8P88idj18P/z7v718P8UPoL18P/18P/18P/28f8wcb9SZj0UOnn598z18P/49sL18P81g9E8ckgYQ4kgVaL18P8dTZo0gMc9' +
  'a0D18P8ZSZHy67X17//07/9OcUY/kNf28f/28P+Ep2ReaUA5jM/278C6z5BKWjlMelBbkMVwo2/18P9tbE6twXvhzp/v6qVl' +
  'XD8oPUbexY8wbqkzdce6wW0RKEEVNl6HdlKEsZIaQ3GSiFvKzIJzlMAuRFx1d0lllVXk4JoaTISgnGHVvpHl16wPHzZFj8Xs' +
  '6eVKfK93psx8kLA9TTn18P+5ur51jlNqgE9AcnqBsXnPuIR2qICRrs1mdIQaMUQiQ2NceUxiZ1otWXS4uryasGyqr7xncHea' +
  'wYDY4uTDuYdwqZWjvrVLjKWyvZVud4w+aKuKWkR0VEHCu7SGn69HiZfDxagsMUP18f/O176ZxZkrMDo3RUXd13ojR3R9gX2u' +
  'oIbJ1tqpwd+XsadggaKqzZ/N2Z4gK0CNjHw6WkUuSVqtsH/9+/fz8fY3Zqh0kJOBvqtLUWEVIzpbSzxKV2qInY+NnHzItpme' +
  'nX34+dePj4+xqZg9SmKosKD789SVh4E0aJPIxslIbqmTp4weLEiHZUxUcFrRu5h+nGKAqIeBoqT77+rRyMl8matOc6mPnbLG' +
  'uplPaHRRbk8yTnxVdpHAqIS/0a3z7vvr6e/48//69f/89//38f/++f//+///+f8HGTUqXa8UQn3///8pXac1WVvCqH3Nv5Zb' +
  'm6BFZ2VcmXZBer9qqrmzwsqeGUrvAAAA63RSTlMA+wP5AgH8/gH+tvUGEw8c/gqW/i3+5Bf+/jchTt7o/HmS/vEnhVHsidm7' +
  'bEIyPbNymmX+VkZb7/7+v/6mSsv+o3/I1P7+/v7E/tD+/v7+n/7+/o3+/qlh/v6qrP7+/v7+/v3+/rH+/v7+/v7+/v7+/f79' +
  '/v7+/v7a/v7+/v7+/vz+/f7+Q/6vOv79/v3+/vyL/f3+/P5J/if+/v3+/v7+/l3h/v5ZXvT+ff7+/v79/vr8/f7+/vv+/s2r' +
  '/vn6/v71/f5y6P6kfI+lyP7+/rtw/v76n7j+4P7J8dPelP7d0J3908jO6MiLuOPVjdHXpQAAAAlwSFlzAAAD6AAAA+gBtXtS' +
  'awAAGglJREFUeJztXXd4E1e2P56Ze+ciyTKSG9hyt9z7uMRggyvFFMcYjAPBhGIgS1l62VADoZcQIPQSUpeUl977JtndlO29' +
  '7+v7zYxkOaZD8r47RRrZBkxiQHwv5w9HjGY093dPLzMBuJFEAIj1wAMqHbByAAghuP2IIAS2Bx78zcmTJ99//+TJkyd/849H' +
  'DthuQzCIILA8/utdy15dtmvXssulpaWlZ758/+Q/HrDCbYYFIbCFFfztpfsVenlaaWnp+g307/u/ecIGtxMWBDbHr//+6rLD' +
  '7/31vff+enh9aU1N6eUNl0vnzp0791d/ib59GIMQJP/6b4eXla4//O677757eNm8eTU1NTWl648fXz937vvL/vsJBhG4HQgh' +
  'iPrfp79+adr6l93vvvfSrmmXL1MkNesXbV+06OiFJ1+99OefW6h1C3hCiHni76/88+Vl63e99/KGaQ01G16eVjNvXs3xRdun' +
  '79y+c/qlnTu3b/+x7XbAgpgnnvzq6X9Ou3x52obLDQ0NLevWjWhoGHH8mUOLLlw4unPndIVuBywIHn7ywlNPvXa8oaGhYcTA' +
  'loEjRoxo+OqrhnWLjn54/ML27dvvVunnHAQ4ETjw6aVFMw89c2FeQ0NLy4gRA1ta1n31zDNftXz14dGjzxw6dGj//v3733nn' +
  'nXceD3CbjMD6l+l3bz96dOeTNZQrIwbeNXDgug0fPvPhh6/d89prh2bOPDRz5syZR47sOP/vyYEtYog88eT0u3deePLJ9TU1' +
  'FMnAlpaBA1vWLXrmHkoUxsx7Zn7//PnVq8//NKDVBcHmP1+afunShblz585rGEGhDLyrpaWl5RgFcoL+ObTolRNLT3wx6/yO' +
  'Pz4ewFAI2H4yffqlX40+c6aUMoUCueuulnW7Nhx7/fXXjr1y4vV7li46fvyDd058/tSc1at/Ghy4WBBs/tP0bSvvVKDMo4pC' +
  'aeC0p+97/diyXct2HTvx+onfHl2087dP/faDWavn/PHhwNV8xP1ky8GVd44dO/pLCmWgypW7pj295rUL66Zt2LDh1V2vLlq6' +
  'dOk9R4588MXqOat/ygQqFgIhf5r6/KiVK0fdSbEoWk/BrHvl6acPH77/pfU1NXPnzv3g1S/mzFl95PycHec+PRCoEobg4a0P' +
  'De7oGDXqTgULFbGBioBNHj70F0Pv/3rZtGlzz4z+1YlZa87v2HHu3LkXA9a3IHjw4uLBQ4YMHjX2ztFnVCx33dUy7etx44YP' +
  'HTp06Gef3X//S8deOTZrzprXz58/cu7cuf8JUCgELJ+cXdy//5Aho0ZRzadYGga2TDs8/N7hQ4dOnjxZBTR81hezZs1a88sX' +
  'Xjx3LlBdC4Hg/7i4oP8QH1tKS2vmrXtp+GQKYfjkyZMnD/3F5Mnj1nz+4qxZa5564YWDBz8NUHNM4MDys/sWDxkyWIEymkIp' +
  'rXn5s+G/oMwYOnz45HGUNePGPXXwyBwK5uDzfwgJTCgINv/Xguf3LfZB+fLL0tKvPxs6XOEKhXLvuMnjxq2Z9fkLR+bMmbP6' +
  'YMfyzYGpLAgefr5//8FjOwaPGjWW2jCFjlEQw4cOH3cvxTJu3L1r1sx5ce+LO+acf2Fxx9uPBy6UxQ8tXjl4cEfHWB3LmVfu' +
  'u+9elcZRIPfeN2vWjlVLfrnjxW2LFy9e8POAhfL22ea9Fxd3UNeiYjlz5oOZ31/6b5TuU2jp0qU7Vi1Z9cuD+54fMqT/gicC' +
  'FcqB5c1bt+45239whypko0ePHr1t+t37Z35foaVLl9L/rFqyZMmSg59f7HfHggWPBCYUApH/uXXL1KlTzz7Uf8hgRffvHD16' +
  '7LZLP9By4P37969adfeqVUuWLFyyasnsfgv6PfRAoEKxvrm1eeTIkSMvPtS//5COUVRh7hy9ctsPdNqyZcvWrVu2bFmxcOHC' +
  'vYn9EhOXJwcmFEDw4+aRI8eMGTP17AKFL4NHjR07duzKbdu27Vu5b9tUhZqb9+xZsXDhjNn9+iWG/yxAXSQgeHjqyJFjRo4Z' +
  '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';

/** Пропорции исходника: ширина считается из высоты, чтобы знак не плющило. */
export const BRAND_LOGO_ASPECT = 202 / 152;

export function brandLogoBuffer(): Buffer {
  return Buffer.from(BRAND_LOGO_PNG_BASE64, 'base64');
}
