import {
  BLOG_IMAGE_MAX_BYTES,
  BLOG_POST_MAX_IMAGES,
  BLOG_VIDEO_MAX_BYTES,
  BLOG_VIDEO_MAX_SECONDS,
} from '@vedamatch/shared';
import {
  blogMediaKindFor,
  blogVideoDurationDenial,
  blogVideoExtension,
  planBlogMedia,
  validateBlogMedia,
} from './blog-media-rules';

const photo = (size = 1000) => ({ mimetype: 'image/jpeg', size });
const video = (size = 1000) => ({ mimetype: 'video/mp4', size });

describe('blogMediaKindFor', () => {
  it('knows photos and the two video containers', () => {
    expect(blogMediaKindFor('image/webp')).toBe('photo');
    expect(blogMediaKindFor('video/mp4')).toBe('video');
    expect(blogMediaKindFor('video/webm')).toBe('video');
  });

  // .mov с айфона обычно HEVC — в браузере чёрный экран без ошибки.
  it('refuses quicktime and everything else', () => {
    expect(blogMediaKindFor('video/quicktime')).toBeNull();
    expect(blogMediaKindFor('application/pdf')).toBeNull();
  });
});

describe('validateBlogMedia', () => {
  it('holds a photo to the photo limit, not the video one', () => {
    expect(validateBlogMedia(photo(BLOG_IMAGE_MAX_BYTES))).toBeNull();
    expect(validateBlogMedia(photo(BLOG_IMAGE_MAX_BYTES + 1))).toBe(
      'file_too_large',
    );
  });

  it('lets a video be bigger than a photo', () => {
    expect(validateBlogMedia(video(BLOG_IMAGE_MAX_BYTES * 2))).toBeNull();
    expect(validateBlogMedia(video(BLOG_VIDEO_MAX_BYTES + 1))).toBe(
      'file_too_large',
    );
  });

  it('refuses a missing or unknown file', () => {
    expect(validateBlogMedia(undefined)).toBe('unsupported_type');
    expect(validateBlogMedia({ mimetype: 'video/quicktime', size: 1 })).toBe(
      'unsupported_type',
    );
  });
});

describe('planBlogMedia', () => {
  it('lets one video through and refuses the second', () => {
    const plan = planBlogMedia([video(), photo(), video()], {
      total: 0,
      videos: 0,
    });
    expect(
      plan.map((item) => ('denial' in item ? item.denial : item.kind)),
    ).toEqual(['video', 'photo', 'too_many_videos']);
  });

  // При правке ролик уже может лежать в посте.
  it('counts the video already in the post', () => {
    const plan = planBlogMedia([video()], { total: 1, videos: 1 });
    expect(plan[0]).toMatchObject({ denial: 'too_many_videos' });
  });

  it('counts the whole post against the attachment limit', () => {
    const plan = planBlogMedia([photo(), photo()], {
      total: BLOG_POST_MAX_IMAGES - 1,
      videos: 0,
    });
    expect(
      plan.map((item) => ('denial' in item ? item.denial : item.kind)),
    ).toEqual(['photo', 'too_many_images']);
  });

  // Плохой файл не занимает место хорошего.
  it('does not let a refused file use up a slot', () => {
    const plan = planBlogMedia([video(BLOG_VIDEO_MAX_BYTES + 1), video()], {
      total: 0,
      videos: 0,
    });
    expect(
      plan.map((item) => ('denial' in item ? item.denial : item.kind)),
    ).toEqual(['file_too_large', 'video']);
  });
});

describe('blogVideoExtension', () => {
  it('names the container', () => {
    expect(blogVideoExtension('video/webm')).toBe('.webm');
    expect(blogVideoExtension('video/mp4')).toBe('.mp4');
  });
});

describe('blogVideoDurationDenial', () => {
  it('accepts up to the limit inclusive', () => {
    expect(blogVideoDurationDenial(1)).toBeNull();
    expect(blogVideoDurationDenial(BLOG_VIDEO_MAX_SECONDS)).toBeNull();
  });

  it('refuses a too long or unreadable video', () => {
    expect(blogVideoDurationDenial(BLOG_VIDEO_MAX_SECONDS + 1)).toBe(
      'video_too_long',
    );
    expect(blogVideoDurationDenial(null)).toBe('video_unreadable');
    expect(blogVideoDurationDenial(0)).toBe('video_unreadable');
  });
});
