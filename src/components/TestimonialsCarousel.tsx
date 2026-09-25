import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Quote, ChevronLeft, ChevronRight, Star, Heart } from 'lucide-react';

interface Testimonial {
  id: number;
  quote: string;
  author: string;
  role: string;
  wing: string;
  rating: number;
}

const testimonials: Testimonial[] = [
  {
    id: 1,
    quote: "PineVela made finding an approved room with high-speed WiFi so simple. The transparent wing listings helped me choose my space securely without any hassle!",
    author: "Sarah Jenkins",
    role: "Computer Science Undergraduate",
    wing: "North Wing Resident",
    rating: 5
  },
  {
    id: 2,
    quote: "Filing a digital maintenance ticket took seconds. Our resident staff were immediately notified, and the issue was fully resolved in under 12 hours. Pure efficiency!",
    author: "Michael Tremblay",
    role: "Engineering Student",
    wing: "South Side Resident",
    rating: 5
  },
  {
    id: 3,
    quote: "The biometric access security overview and verified manager protocol give me complete peace of mind. Truly built with safety and trust in mind.",
    author: "David Olawale",
    role: "Medical Resident",
    wing: "North Wing Resident",
    rating: 5
  },
  {
    id: 4,
    quote: "No more tracking paper receipts or chasing down bank statements. Having my room allocation and digital payment history in one unified view is flawless.",
    author: "Emily Ross",
    role: "Business Major",
    wing: "South Side Resident",
    rating: 5
  }
];

export default function TestimonialsCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0); // -1 for left, 1 for right

  useEffect(() => {
    const timer = setInterval(() => {
      handleNext();
    }, 5000);
    return () => clearInterval(timer);
  }, [currentIndex]);

  const handlePrev = () => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev === 0 ? testimonials.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setDirection(1);
    setCurrentIndex((prev) => (prev === testimonials.length - 1 ? 0 : prev + 1));
  };

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 100 : -100,
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (dir: number) => ({
      x: dir < 0 ? 100 : -100,
      opacity: 0
    })
  };

  const activeTestimonial = testimonials[currentIndex];

  return (
    <section className="bg-blue-50/40 backdrop-blur-md py-16 px-6 rounded-3xl border border-blue-200/30 shadow-lg overflow-hidden relative">
      <div className="absolute top-6 right-6 text-slate-100 pointer-events-none">
        <Quote size={120} className="opacity-40" />
      </div>

      <div className="max-w-4xl mx-auto space-y-8 relative z-10">
        <div className="text-center space-y-2">
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-950 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
            <Heart size={12} className="fill-blue-900 stroke-blue-900" />
            Resident Experiences
          </span>
          <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
            Hear from our Student Community
          </h3>
          <p className="text-xs text-slate-500 max-w-lg mx-auto">
            Find out why student residents and hostel managers trust the PineVela digital ecosystem.
          </p>
        </div>

        {/* Carousel Area */}
        <div className="relative min-h-[220px] md:min-h-[180px] flex items-center justify-center">
          <AnimatePresence initial={false} custom={direction} mode="wait">
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="text-center space-y-6 max-w-2xl px-8"
            >
              {/* Rating stars */}
              <div className="flex items-center justify-center gap-1">
                {[...Array(activeTestimonial.rating)].map((_, i) => (
                  <Star key={i} size={16} className="text-amber-400 fill-amber-400" />
                ))}
              </div>

              {/* Quote text */}
              <p className="text-sm md:text-base text-slate-700 italic font-medium leading-relaxed">
                "{activeTestimonial.quote}"
              </p>

              {/* Author Info */}
              <div className="space-y-1">
                <h5 className="font-bold text-slate-900 text-sm md:text-base">
                  {activeTestimonial.author}
                </h5>
                <p className="text-[11px] md:text-xs text-slate-400 font-semibold uppercase tracking-wider">
                  {activeTestimonial.role} &bull; <span className="text-blue-900">{activeTestimonial.wing}</span>
                </p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation buttons */}
          <button
            onClick={handlePrev}
            className="absolute left-0 p-2.5 rounded-full bg-white border border-slate-100 hover:border-slate-200 text-slate-600 hover:text-blue-900 shadow-sm hover:shadow-md transition-all cursor-pointer focus:outline-none"
            aria-label="Previous testimonial"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={handleNext}
            className="absolute right-0 p-2.5 rounded-full bg-white border border-slate-100 hover:border-slate-200 text-slate-600 hover:text-blue-900 shadow-sm hover:shadow-md transition-all cursor-pointer focus:outline-none"
            aria-label="Next testimonial"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Dots Indicators */}
        <div className="flex items-center justify-center gap-2">
          {testimonials.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setDirection(index > currentIndex ? 1 : -1);
                setCurrentIndex(index);
              }}
              className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                index === currentIndex ? 'w-6 bg-blue-900' : 'w-2 bg-slate-200 hover:bg-slate-300'
              }`}
              aria-label={`Go to testimonial slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
