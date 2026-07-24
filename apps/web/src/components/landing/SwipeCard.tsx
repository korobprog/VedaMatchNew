"use client";

import { useRef, useState } from "react";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import Image from "next/image";
import { X, Star, Heart } from "lucide-react";

interface SwipeCardProps {
  name: string;
  age: number;
  location: string;
  description: string;
  imageUrl: string;
  compatibility?: number;
  tags?: string[];
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onLike?: () => void;
}

export function SwipeCard({
  name,
  age,
  location,
  description,
  imageUrl,
  compatibility = 0,
  tags = [],
  onSwipeLeft,
  onSwipeRight,
  onLike,
}: SwipeCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const constraintsRef = useRef(null);
  
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-20, 20]);
  const opacityX = useTransform(x, [-200, 0, 200], [0.5, 1, 0.5]);
  
  const nopeOpacity = useTransform(x, [-100, 0], [1, 0]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const starOpacity = useTransform(x, [-50, 0, 50], [0, 0, 0]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    const threshold = 100;
    
    if (info.offset.x > threshold) {
      onSwipeRight?.();
    } else if (info.offset.x < -threshold) {
      onSwipeLeft?.();
    }
  };

  return (
    <motion.div
      ref={constraintsRef}
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
      drag={!isDragging}
      dragConstraints={{ left: -200, right: 200, top: -200, bottom: 200 }}
      dragElastic={0.7}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      style={{ x, rotate, opacity: opacityX }}
      whileTap={{ cursor: "grabbing" }}
    >
      <div className="relative w-full h-full rounded-3xl overflow-hidden bg-gradient-to-br from-white/10 to-white/[0.02] border border-glass-brd">
        {/* Image */}
        <div className="relative w-full h-[65%]">
          <Image
            src={imageUrl}
            alt={name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 400px"
          />
          
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-bg-0 via-transparent to-transparent" />
          
          {/* Swipe indicators */}
          <motion.div
            style={{ opacity: likeOpacity }}
            className="absolute top-6 right-6 px-4 py-2 rounded-xl bg-green-500/90 backdrop-blur-sm border-2 border-green-400"
          >
            <span className="text-white font-bold text-lg">LIKE</span>
          </motion.div>
          
          <motion.div
            style={{ opacity: nopeOpacity }}
            className="absolute top-6 left-6 px-4 py-2 rounded-xl bg-red-500/90 backdrop-blur-sm border-2 border-red-400"
          >
            <span className="text-white font-bold text-lg">NOPE</span>
          </motion.div>

          <motion.div
            style={{ opacity: starOpacity }}
            className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-cyan-500/90 backdrop-blur-sm border-2 border-cyan-400"
          >
            <span className="text-white font-bold text-lg">SUPER LIKE</span>
          </motion.div>
        </div>

        {/* Info section */}
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-display text-xl font-bold text-text-0">
                {name}, {age}
              </h3>
              <p className="text-text-1 text-sm">{location}</p>
            </div>
            {compatibility > 0 && (
              <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-cyan/20 border border-cyan/40">
                <span className="text-cyan font-bold text-sm">{compatibility}%</span>
              </div>
            )}
          </div>
          
          <p className="text-text-1 text-sm mb-3 line-clamp-2">{description}</p>
          
          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.slice(0, 3).map((tag) => (
                <span 
                  key={tag}
                  className="px-2 py-1 rounded-full bg-glass text-text-1 text-xs font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onSwipeLeft?.()}
            className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm border border-glass-brd flex items-center justify-center text-text-1 hover:text-red-500 hover:border-red-500/50 transition-colors"
            aria-label="Не нравится"
          >
            <X size={28} />
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onLike?.()}
            className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-glass-brd flex items-center justify-center text-text-1 hover:text-cyan hover:border-cyan/50 transition-colors"
            aria-label="Нравится"
          >
            <Star size={24} />
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onSwipeRight?.()}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-magenta to-[#B23EFF] flex items-center justify-center text-white shadow-[0_0_24px_rgba(255,62,158,0.45)]"
            aria-label="Люблю"
          >
            <Heart size={28} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
