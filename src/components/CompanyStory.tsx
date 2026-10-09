import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { companyContactChannels, companySections, CompanySection } from './companyStoryContent';
import './CompanyStory.css';
import { usePlatformSettings } from '../context/PlatformSettingsContext';
import { EMPTY_CONTACT_DETAILS } from '../../platformSettings';

function ContactDestination({ contact, className, children }: {
  contact: { name: string; href: string }; className?: string; children: React.ReactNode;
}) {
  return contact.href ? (
    <a className={className} href={contact.href} target="_blank" rel="noopener noreferrer" aria-label={`Connect with PineVela on ${contact.name}`}>{children}</a>
  ) : <div className={className}>{children}</div>;
}

function StorySection({ section, index }: { section: CompanySection; index: number }) {
  const { settings } = usePlatformSettings();
  const details = settings?.contactDetails || EMPTY_CONTACT_DETAILS;
  const contacts = companyContactChannels.map(channel => ({ ...channel,
    href: channel.field === 'whatsappNumber' ? (details.whatsappNumber ? `https://wa.me/${details.whatsappNumber}` : '') : details[channel.field],
    label: channel.field === 'whatsappNumber' && details.whatsappNumber ? `+${details.whatsappNumber}` : '',
  }));

  return (
    <section id={`story-${section.id}`} className={`company-chapter ${index % 2 ? 'company-chapter-reversed' : ''} ${section.id === 'contact-us' ? 'company-chapter-contact' : ''}`} aria-labelledby={`title-${section.id}`}>
        <div className="company-chapter-grid">
          {section.image ? (
            <div className={`company-image-card company-image-${section.id}`}>
              <img src={`/images/company/${section.image}`} alt={section.alt} width="1024" height="1024" loading="lazy" />
            </div>
          ) : null}
          <div className="company-copy">
            <p className="company-eyebrow">{section.eyebrow}</p>
            <h2 id={`title-${section.id}`} tabIndex={-1}>{section.title}</h2>
            <div className="company-paragraphs">
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex} className={paragraphIndex === 0 ? 'company-lead' : paragraph === 'So, who are we really?' ? 'company-subheading' : undefined}>
                  {paragraph}
                </p>
              ))}
            </div>
            {section.id === 'contact-us' && <div className="company-contact-links">
              {contacts.map(contact => <ContactDestination key={contact.name} contact={contact} className="company-contact-row">
                <span className="company-contact-icon" aria-hidden="true"><img className={`company-platform-${contact.name.toLowerCase()}`} src={`/images/company/${contact.icon}`} alt="" width="28" height="28" loading="lazy" /></span>
                <span className="company-contact-details"><span className="company-contact-name">{contact.name}</span><span className="company-contact-url">{contact.name === 'WhatsApp' ? contact.label : contact.href.replace(/^https?:\/\//, '')}</span></span>
                {contact.href && <ArrowUpRight size={20} aria-hidden="true" />}
              </ContactDestination>)}
            </div>}
          </div>
        </div>
    </section>
  );
}


export default function CompanyStory() {
  return <div className="landing-company-story">
    {companySections.map((section, index) => <StorySection key={section.id} section={section} index={index} />)}
  </div>;
}
