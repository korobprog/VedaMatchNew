import { describe, expect, it } from "vitest";
import {
  BLOG_IMAGE_MAX_BYTES,
  BLOG_POST_MAX_IMAGES,
  BLOG_VIDEO_MAX_BYTES,
} from "@vedamatch/shared";
import { BLOG_MEDIA_ACCEPT, pickBlogFiles } from "./blog-file-pick";

const photo = (name: string, size = 1000) => ({ name, type: "image/jpeg", size });
const video = (name: string, size = 1000) => ({ name, type: "video/mp4", size });

describe("pickBlogFiles", () => {
  it("accepts photos and one video", () => {
    const result = pickBlogFiles([], [photo("a.jpg"), video("b.mp4")]);
    expect(result.files.map((file) => file.name)).toEqual(["a.jpg", "b.mp4"]);
    expect(result.rejected).toEqual([]);
  });

  it("refuses a second video, counting the one already picked", () => {
    const result = pickBlogFiles([video("a.mp4")], [video("b.mp4")]);
    expect(result.rejected).toEqual([{ name: "b.mp4", reason: "too_many_videos" }]);
  });

  // При правке ролик уже может лежать в посте.
  it("counts the video already in the post", () => {
    const result = pickBlogFiles([], [video("b.mp4")], { total: 1, videos: 1 });
    expect(result.rejected[0]?.reason).toBe("too_many_videos");
  });

  it("holds photos and videos to their own size limits", () => {
    const result = pickBlogFiles(
      [],
      [
        photo("big.jpg", BLOG_IMAGE_MAX_BYTES + 1),
        video("ok.mp4", BLOG_IMAGE_MAX_BYTES + 1),
        video("huge.mp4", BLOG_VIDEO_MAX_BYTES + 1),
      ],
    );
    expect(result.files.map((file) => file.name)).toEqual(["ok.mp4"]);
    expect(result.rejected).toEqual([
      { name: "big.jpg", reason: "file_too_large" },
      { name: "huge.mp4", reason: "file_too_large" },
    ]);
  });

  // .mov с айфона — HEVC, в браузере чёрный экран.
  it("refuses quicktime", () => {
    const result = pickBlogFiles([], [{ name: "a.mov", type: "video/quicktime", size: 1 }]);
    expect(result.rejected).toEqual([{ name: "a.mov", reason: "unsupported_type" }]);
  });

  it("stops at the attachment limit for the whole post", () => {
    const result = pickBlogFiles([], [photo("a.jpg"), photo("b.jpg")], {
      total: BLOG_POST_MAX_IMAGES - 1,
      videos: 0,
    });
    expect(result.files.map((file) => file.name)).toEqual(["a.jpg"]);
    expect(result.rejected).toEqual([{ name: "b.jpg", reason: "too_many_images" }]);
  });
});

describe("BLOG_MEDIA_ACCEPT", () => {
  it("offers photos and both video containers", () => {
    expect(BLOG_MEDIA_ACCEPT).toBe("image/jpeg,image/png,image/webp,video/mp4,video/webm");
  });
});
