var fs = require('fs');
var Handlebars = require('handlebars');
var gravatar = require('gravatar');
var _ = require('underscore');
var _s = require('underscore.string');
var moment = require('moment');
var axios = require('axios')

function hasEmail(resume) {
  return !!resume.basics && !!resume.basics.email;
}

function getNetwork(profiles, network_name) {
  return _.find(profiles, function (profile) {
    return profile.network.toLowerCase() === network_name;
  });
}

function humanizeDuration(moment_obj, did_leave_company) {
  var days,
    months = moment_obj.months(),
    years = moment_obj.years(),
    month_str = months > 1 ? 'months' : 'month',
    year_str = years > 1 ? 'years' : 'year';

  if (months && years) {
    return years + ' ' + year_str + ' ' + months + ' ' + month_str;
  }

  if (months) {
    return months + ' ' + month_str;
  }

  if (years) {
    return years + ' ' + year_str;
  }

  if (did_leave_company) {
    days = moment_obj.days();

    return (days > 1 ? days + ' days' : days + ' day');
  } else {
    return 'Recently joined';
  }
}

function getUrlFromUsername(site, username) {
  var url_map = {
    github: 'github.com',
    twitter: 'twitter.com',
    soundcloud: 'soundcloud.com',
    pinterest: 'pinterest.com',
    vimeo: 'vimeo.com',
    behance: 'behance.net',
    codepen: 'codepen.io',
    foursquare: 'foursquare.com',
    reddit: 'reddit.com',
    spotify: 'spotify.com',
    dribble: 'dribbble.com',
    dribbble: 'dribbble.com',
    facebook: 'facebook.com',
    angellist: 'angel.co',
    bitbucket: 'bitbucket.org'
  };

  site = site.toLowerCase();

  if (!username || !url_map[site]) {
    return;
  }

  switch (site) {
    case 'skype':
      return 'skype:' + username + '?call';
    case 'reddit':
    case 'spotify':
      return '//' + 'open.' + url_map[site] + '/user/' + username;
    default:
      return '//' + url_map[site] + '/' + username;
  }
}

const githubRepoCache = {}

function getGithubApi(url) {
  return url.replace('https://github.com/', 'https://api.github.com/repos/')
}

async function getRepoStars (url) {
  if (githubRepoCache[url])
    return githubRepoCache[url].stargazers_count
  try {
    const api = getGithubApi(url)
    const { data } = await axios.get(api)
    githubRepoCache[url] = data
    return data.stargazers_count
  }
  catch(e){
    console.error(e)
    return 'NaN'
  }
}

// ---- Section exclusion support ----
// Maps a lowercase section key to a function that nulls it out on the resume object.
const SECTION_REMOVERS = {
  about: (r) => { if (r.basics) r.basics.summary = null },
  work: (r) => { r.work = null },
  skills: (r) => { r.skills = null },
  education: (r) => { r.education = null },
  projects: (r) => { r.projects = null },
  publications: (r) => { r.publications = null },
  awards: (r) => { r.awards = null },
  volunteer: (r) => { r.volunteer = null },
  interests: (r) => { r.interests = null },
  references: (r) => { r.references = null },
  languages: (r) => { r.languages = null },
};

// Removes the given section keys (array of strings) from the resume object in place.
// Only called when the caller explicitly passes sections to exclude — render() itself
// never decides this on its own, so callers control per-output-type behavior.
function applyExcludedSections(resume, excludeSections) {
  const excluded = (excludeSections || [])
    .map((s) => String(s).trim().toLowerCase())
    .filter(Boolean);

  excluded.forEach((key) => {
    const remover = SECTION_REMOVERS[key];
    if (remover) {
      remover(resume);
    } else {
      console.warn(`[resume] Unknown section to exclude: "${key}"`);
    }
  });

  return excluded;
}
// ---- End section exclusion support ----

// options.excludeSections: optional array of section keys to strip from this
// particular render (e.g. only used for the PDF pass, not the HTML pass).
async function render(resume, options) {
  options = options || {};

  var css = fs.readFileSync(__dirname + '/assets/css/theme.css', 'utf-8'),
    template = fs.readFileSync(__dirname + '/resume.hbs', 'utf-8'),
    profiles = resume.basics.profiles,
    social_sites = ["github", "linkedin", "stackoverflow", "twitter",
      "soundcloud", "pinterest", "vimeo", "behance",
      "codepen", "foursquare", "reddit", "spotify",
      "dribble", "dribbble", "facebook", "angellist",
      "bitbucket", "skype"],
    date_format = 'MMM YYYY';

  if (options.excludeSections && options.excludeSections.length) {
    const excludedSections = applyExcludedSections(resume, options.excludeSections);
    if (excludedSections.length) {
      console.log(`[resume] Excluding sections: ${excludedSections.join(', ')}`);
    }
  }

  if (!resume.basics.picture && hasEmail(resume)) {
    resume.basics.picture = gravatar.url(resume.basics.email.replace('(at)', '@'), {
      s: '100',
      r: 'pg',
      d: 'mm'
    });
  }

  if (resume.languages) {
    resume.basics.languages = _.pluck(resume.languages, 'language').join(', ');
  }

  _.each(resume.work, function (work_info) {
    var did_leave_company,
      start_date = work_info.startDate && new Date(work_info.startDate),
      end_date = work_info.endDate && new Date(work_info.endDate);

    if (start_date) {
      work_info.startDate = moment(start_date).format(date_format);
    }

    if (end_date) {
      work_info.endDate = moment(end_date).format(date_format);
    }

    did_leave_company = !!end_date;

    if (start_date) {
      end_date = end_date || new Date();
      work_info.duration = humanizeDuration(
        moment.duration(end_date.getTime() - start_date.getTime()),
        did_leave_company)
    }
  });

  _.each(resume.skills, function (skill_info) {
    var levels = ['Beginner', 'Intermediate', 'Advanced', 'Master'];

    if (skill_info.level) {
      skill_info.skill_class = skill_info.level.toLowerCase();
      skill_info.level = _s.capitalize(skill_info.level.trim());
      skill_info.display_progress_bar = _.contains(levels,
        skill_info.level);
    }
  });

  _.each(resume.education, function (education_info) {
    _.each(['startDate', 'endDate'], function (date) {
      var date_obj = new Date(education_info[date]);

      if (education_info[date]) {
        education_info[date] = moment(date_obj).format(date_format);
      }
    });
  });

  _.each(resume.awards, function (award_info) {
    if (award_info.date) {
      award_info.date = moment(new Date(award_info.date)).format(date_format)
    }
  });

  _.each(resume.publications, function (publication_info) {
    if (publication_info.releaseDate) {
      publication_info.releaseDate = moment(new Date(publication_info.releaseDate)).format('MMM DD, YYYY')
    }
  });

  _.each(resume.volunteer, function (volunteer_info) {
    _.each(['startDate', 'endDate'], function (date) {
      var date_obj = new Date(volunteer_info[date]);

      if (volunteer_info[date]) {
        volunteer_info[date] = moment(date_obj).format(date_format);
      }
    });
  });

  _.each(social_sites, function (site) {
    var username,
      social_account = getNetwork(profiles, site);

    if (social_account) {
      username = social_account.username;
      resume.basics[site + '_url'] =
        getUrlFromUsername(site, username) || social_account.url;
    }
  });

  // Guarded: resume.projects may be null if the "projects" section was excluded above.
  if (resume.projects) {
    for (const project of resume.projects) {
      if (project.githubUrl)
        project.stars = await getRepoStars(project.githubUrl)
    }
  }

  Handlebars.registerHelper('toSocialIcon', function (text) {
    return {
      linkedin: 'ri:linkedin-box-fill',
      github: 'ri:github-fill',
      instagram: 'ri:instagram-line',
      twitter: 'ri:twitter-fill',
      website: 'ri:global-line',
      link: 'ri:arrow-right-up-line',
      portfolio: 'ri:account-circle-fill'
    }[text.trim().toLowerCase()]
  })

  Handlebars.registerHelper('join', function (arr) {
    return arr.join(', ')
  })

  Handlebars.registerHelper('getGithubApi', getGithubApi)

  Handlebars.registerHelper('breaklines', function(text) {
    text = Handlebars.Utils.escapeExpression(text);
    text = text.replace(/(\r\n|\n|\r)/gm, '<br>');
    return new Handlebars.SafeString(text);
  })

  Handlebars.registerHelper('getBuildDate', function() {
    return moment().format('MMMM Do YYYY, h:mm:ss a')
  })

  return Handlebars.compile(template)({
    css: css,
    resume: resume
  });
}

module.exports = {
  render: render
};