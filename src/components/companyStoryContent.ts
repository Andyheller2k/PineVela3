export const companySections = [
  { id: 'about-us', title: 'About Us', eyebrow: '01 / The people behind PineVela', image: 'about-us.jpg', alt: 'A team bringing their hands together around a table', paragraphs: [
    'PineVela is a cooperative system built for students, communities, and management teams, designed to make everyday activities easier, more connected, and more accessible.',
    'For students, PineVela provides a seamless way to engage in e-commerce from the comfort of their own space. Whether they are looking for products, services, accommodation-related solutions, or opportunities within their community, PineVela brings these experiences together in one accessible platform.',
    'For accommodation management teams, PineVela provides a maintenance and management system that helps resident managers keep track of their accommodations, monitor issues, and respond to problems that may occur during students’ stays. Our goal is to make management more organized while helping residents receive better support.',
    'Beyond accommodation and e-commerce, PineVela also provides a space for students and professionals to showcase their skills and services to the world. Through our service-hosting platform, individuals can present what they do, reach potential customers, and turn their skills into real opportunities.',
    'So, who are we really?',
    'We are a team of dedicated professionals building systems that make everyday activities easier.',
    'We believe students should be able to learn, live, discover, buy, sell, and connect without unnecessary friction. We believe management teams should have the tools they need to operate efficiently. And we believe individuals with valuable skills should have a place to make those skills visible and reach real customers.',
    'PineVela exists to help students, communities, and management move forward with greater ease, connection, and traction',
  ] },
  { id: 'our-vision', title: 'Our Vision', eyebrow: '02 / A more connected future', image: 'our-vision.jpg', alt: 'Four students standing together on campus', paragraphs: [
    'Our core vision as a team and as a cooperative is to help students grow as a community while staying seamlessly connected with their residential managers.',
    'We envision a system where students can advertise their skills, products, services, and knowledge beyond the people they already know. Instead of your work, skills, or items being seen only by friends on a WhatsApp status or within your immediate circle, PineVela aims to make discovery possible across institutions and communities.',
    'We imagine a future where students can trade with students from other schools, exchange skills and knowledge across institutions, discover new opportunities, and connect with people who are genuinely interested in what they have to offer.',
    'We want to make it easier for people to put their work in front of the right audience — whether they are selling an item, offering a service, sharing a skill, or looking for someone with the knowledge they need.',
    'Ultimately, we envision an interconnected network of students, professionals, communities, and institutions where sharing, discovery, and exchange are made easier, more affordable, and less time-consuming.',
    'PineVela is our step toward making that network a reality.',
  ] },
  { id: 'partner-with-us', title: 'Partner with Us', eyebrow: '03 / Move forward together', image: 'partner-with-us-enhanced.webp', alt: 'Two professionals shaking hands across a table', paragraphs: [
    'PineVela is home to people with a shared interest in connection, collaboration, and creating opportunities among peers.',
    'We believe that meaningful connections should not be limited by school, location, or existing social circles. By partnering with PineVela, you become part of a growing network designed to connect students, professionals, businesses, accommodation managers, service providers, and communities with people who are looking for what they have to offer.',
    'Whether you want to provide services, showcase products, support students, manage accommodation, connect with new communities, or create opportunities, PineVela provides a platform where those connections can happen.',
    'We are open to partnerships with individuals, businesses, institutions, student communities, accommodation providers, and organizations that share our interest in building a more connected ecosystem.',
    'If you believe in making connection, discovery, and collaboration easier, we would like to hear from you.',
  ] },
  { id: 'contact-us', title: 'Contact Us', eyebrow: '04 / Keep the conversation going', image: '', alt: '', paragraphs: ['Connect with PineVela through our social channels and reach us directly through the platforms where our community lives.'] },
] as const;

export type CompanySection = typeof companySections[number];

export const companyContactChannels = [
  { name: 'LinkedIn', field: 'linkedinUrl', icon: 'linkedin.jpg' },
  { name: 'WhatsApp', field: 'whatsappNumber', icon: 'whatsapp.jpg' },
  { name: 'Facebook', field: 'facebookUrl', icon: 'facebook.jpg' },
  { name: 'TikTok', field: 'tiktokUrl', icon: 'tiktok.jpg' },
] as const;
