import {
  buildStoryVideoArgs,
  estimateReadingSeconds,
  ffmpegPath,
} from './story-video';
import { STORY_HEIGHT, STORY_WIDTH } from './story-image';

describe('buildStoryVideoArgs', () => {
  const args = buildStoryVideoArgs({
    videoPath: '/tmp/in.mp4',
    overlayPath: '/tmp/overlay.png',
    outputPath: '/tmp/out.mp4',
  });
  const filter = args[args.indexOf('-filter_complex') + 1];

  it('первым входом берёт ролик, вторым — подпись', () => {
    expect(args.indexOf('-i')).toBeLessThan(args.lastIndexOf('-i'));
    expect(args[args.indexOf('-i') + 1]).toBe('/tmp/in.mp4');
    expect(args[args.lastIndexOf('-i') + 1]).toBe('/tmp/overlay.png');
  });

  it('докадрирует ролик до размера сторис перед наложением', () => {
    // Модель отдаёт кадр меньше и другого соотношения (замер: 704×1248).
    // Без crop подпись, свёрстанная под 1080×1920, не совпала бы с картинкой.
    expect(filter).toContain(
      `scale=${STORY_WIDTH}:${STORY_HEIGHT}:force_original_aspect_ratio=increase`,
    );
    expect(filter).toContain(`crop=${STORY_WIDTH}:${STORY_HEIGHT}`);
    expect(filter.indexOf('scale=')).toBeLessThan(filter.indexOf('overlay='));
  });

  it('кладёт подпись в левый верхний угол кадра целиком', () => {
    expect(filter).toContain('[bg][1:v]overlay=0:0[v]');
  });

  it('переносит звук, но не падает на немом ролике', () => {
    expect(args).toContain('0:a?');
    expect(args[args.indexOf('-c:a') + 1]).toBe('copy');
  });

  it('оставляет yuv420p и faststart — без них ролик не играет у зрителя', () => {
    // yuv420p: Safari и предпросмотр Telegram не показывают другие форматы.
    // faststart: без индекса в начале браузер ждёт полной загрузки файла.
    expect(args[args.indexOf('-pix_fmt') + 1]).toBe('yuv420p');
    expect(args[args.indexOf('-movflags') + 1]).toBe('+faststart');
  });

  it('перезаписывает выходной файл и кладёт его последним аргументом', () => {
    expect(args[0]).toBe('-y');
    expect(args[args.length - 1]).toBe('/tmp/out.mp4');
  });
});

describe('ffmpegPath', () => {
  const original = process.env.FFMPEG_PATH;
  afterEach(() => {
    if (original === undefined) delete process.env.FFMPEG_PATH;
    else process.env.FFMPEG_PATH = original;
  });

  it('по умолчанию берёт ffmpeg с PATH', () => {
    delete process.env.FFMPEG_PATH;
    expect(ffmpegPath()).toBe('ffmpeg');
  });

  it('уважает override — в образе и на машине разработчика пути разные', () => {
    process.env.FFMPEG_PATH = 'C:\tools\ffmpeg.exe';
    expect(ffmpegPath()).toBe('C:\tools\ffmpeg.exe');
  });
});

describe('маркировка ИИ-контента в ролике', () => {
  const args = buildStoryVideoArgs({
    videoPath: '/tmp/in.mp4',
    overlayPath: '/tmp/overlay.png',
    outputPath: '/tmp/out.mp4',
  });

  it('пишет отметку в метаданные файла, а не только на пиксели', () => {
    // Надпись на кадре площадка может обрезать или перекодировать, а
    // метаданные читает автоматика, которая решает, вешать ли значок «ИИ».
    const values = args
      .map((arg, index) => (args[index - 1] === '-metadata' ? arg : ''))
      .filter(Boolean);

    expect(values.some((v) => v.startsWith('comment='))).toBe(true);
    expect(values.join(' ')).toContain('AI-generated');
    expect(values.some((v) => v === 'copyright=VedaMatch')).toBe(true);
  });

  it('ставит метаданные до имени выходного файла', () => {
    // ffmpeg относит опции к следующему за ними файлу: после имени выхода
    // они бы просто потерялись.
    expect(args.lastIndexOf('-metadata')).toBeLessThan(args.length - 1);
  });
});

describe('своя звуковая дорожка', () => {
  const withAudio = buildStoryVideoArgs({
    videoPath: '/tmp/in.mp4',
    overlayPath: '/tmp/overlay.png',
    outputPath: '/tmp/out.mp4',
    loopToSeconds: 14,
    voicePath: '/tmp/voice.mp3',
  });

  it('перекодирует звук, а не копирует', () => {
    // ffmpeg отказывается совмещать filtergraph и streamcopy: с `copy` сборка
    // падала с «Filtering and streamcopy cannot be used together».
    expect(withAudio[withAudio.indexOf('-c:a') + 1]).toBe('aac');
  });

  it('родной звук ролика по-прежнему копирует без перекодирования', () => {
    const plain = buildStoryVideoArgs({
      videoPath: '/tmp/in.mp4',
      overlayPath: '/tmp/overlay.png',
      outputPath: '/tmp/out.mp4',
    });
    expect(plain[plain.indexOf('-c:a') + 1]).toBe('copy');
  });

  it('зацикливает ролик и обрезает всё по заданной длине', () => {
    // Повтор бесконечный, музыка своей длины — без -t ролик тянулся бы до
    // конца дорожки или вовсе без конца.
    expect(withAudio).toContain('-stream_loop');
    expect(withAudio[withAudio.indexOf('-t') + 1]).toBe('14');
  });

  it('голос идёт на полной громкости', () => {
    const filter = withAudio[withAudio.indexOf('-filter_complex') + 1];
    expect(filter).toContain('volume=1');
  });
});

describe('estimateReadingSeconds', () => {
  it('коротким подписям даёт не меньше длины самого ролика', () => {
    expect(estimateReadingSeconds('Коротко')).toBeGreaterThanOrEqual(5);
  });

  it('длинной цитате даёт время на прочтение', () => {
    const long = estimateReadingSeconds(
      'Кришна объясняет Арджуне, что ценность действия определяется не только самим поступком, но и тем, ради чего оно совершается.',
      'Шри Кришна · Бхагавад-гита как она есть · 3.9',
    );
    expect(long).toBeGreaterThan(10);
    // Сторис длиннее полуминуты никто не досматривает.
    expect(long).toBeLessThanOrEqual(30);
  });
});

describe('голос и музыка вместе', () => {
  const both = buildStoryVideoArgs({
    videoPath: '/tmp/in.mp4',
    overlayPath: '/tmp/overlay.png',
    outputPath: '/tmp/out.mp4',
    loopToSeconds: 14,
    voicePath: '/tmp/voice.mp3',
    musicPath: '/tmp/music.mp3',
  });
  const filter = both[both.indexOf('-filter_complex') + 1];

  it('сводит обе дорожки без нормализации громкости', () => {
    // amix по умолчанию делит громкость между источниками, и речь провалилась
    // бы ровно настолько, насколько громче музыка. Нам нужно обратное.
    expect(filter).toContain('amix=inputs=2');
    expect(filter).toContain('normalize=0');
  });

  it('музыка звучит заметно тише голоса', () => {
    expect(filter).toContain('volume=1[v]');
    expect(filter).toMatch(/volume=0\.\d+/);
  });

  it('подложке ставит фейды, чтобы не обрывалась на полуноте', () => {
    expect(filter).toContain('afade=t=in');
    expect(filter).toContain('afade=t=out');
  });

  it('индексы входов не путаются, когда голоса нет', () => {
    // Без голоса музыка становится третьим входом, а не четвёртым: ошибка тут
    // молча взяла бы звук ролика вместо подложки.
    const onlyMusic = buildStoryVideoArgs({
      videoPath: '/tmp/in.mp4',
      overlayPath: '/tmp/overlay.png',
      outputPath: '/tmp/out.mp4',
      musicPath: '/tmp/music.mp3',
    });
    const musicFilter = onlyMusic[onlyMusic.indexOf('-filter_complex') + 1];
    expect(musicFilter).toContain('[2:a]');
    expect(musicFilter).not.toContain('[3:a]');
  });

  it('без обеих дорожек переносит родной звук ролика', () => {
    const silent = buildStoryVideoArgs({
      videoPath: '/tmp/in.mp4',
      overlayPath: '/tmp/overlay.png',
      outputPath: '/tmp/out.mp4',
    });
    expect(silent).toContain('0:a?');
    expect(silent[silent.indexOf('-c:a') + 1]).toBe('copy');
  });
});
