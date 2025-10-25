import os
import socket
import dns.resolver
import requests
import pandas as pd
from typing import List, Dict, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from math import ceil
from bs4 import BeautifulSoup
from urllib.parse import urlparse
import re
import time
from sqlalchemy import create_engine, Column, String, Integer, Boolean, JSON, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# Initialize FastAPI app
app = FastAPI(title="Domain Analyzer API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database configuration
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = os.environ.get("DB_PORT", "5432")
DB_USER = os.environ.get("DB_USER", "postgres")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "postgres")
DB_NAME = os.environ.get("DB_NAME", "domain_metadata")

# Create SQLAlchemy engine
DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Define SQLAlchemy models
Base = declarative_base()

class Domain(Base):
    __tablename__ = "domains"

    domain_name = Column(String, primary_key=True)
    ip_addresses = Column(JSON)
    tranco_rank = Column(Integer, nullable=True)
    has_http_service = Column(Boolean, default=False)
    http_headers = Column(JSON, nullable=True)
    page_title = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# Create tables
Base.metadata.create_all(bind=engine)

# Pydantic models for API
class DomainBase(BaseModel):
    domain_name: str

class DomainCreate(DomainBase):
    pass

class DomainResponse(DomainBase):
    ip_addresses: Dict[str, List[str]]
    tranco_rank: Optional[int] = None
    has_http_service: bool
    http_headers: Optional[Dict[str, str]] = None
    page_title: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True

class MessageResponse(BaseModel):
    message: str

class PaginatedDomainsResponse(BaseModel):
    items: List[DomainResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

# Domain analysis functions
class DomainExtractor:
    def __init__(self):
        # Regular expression for matching domain names
        self.domain_pattern = re.compile(
            r'(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}')

    def extract_from_url(self, url):
        """
        Extract domain names from a given URL's content

        Args:
            url (str): URL to extract domains from

        Returns:
            set: Set of unique domain names found
        """
        try:
            # Get the base domain of the URL
            base_domain = self.get_base_domain(url)

            # Fetch the content
            response = requests.get(url, timeout=10)
            response.raise_for_status()

            # Parse HTML
            soup = BeautifulSoup(response.text, 'html.parser')

            # Extract domains from various sources
            domains = set()

            # Extract from href attributes
            for link in soup.find_all('a', href=True):
                href = link['href']
                domain = self.extract_domain_from_url(href)
                if domain and domain != base_domain:
                    domains.add(domain)

            # Extract from text content
            text_content = soup.get_text()
            text_domains = self.extract_domains_from_text(text_content)
            domains.update(text_domains)

            # Add the base domain itself
            domains.add(base_domain)

            return domains

        except Exception as e:
            print(f"Error extracting domains from URL {url}: {e}")
            return set()

    def extract_domain_from_url(self, url):
        """
        Extract domain from a URL

        Args:
            url (str): URL to extract domain from

        Returns:
            str: Domain name or None if not found
        """
        try:
            # Handle relative URLs
            if url.startswith('/'):
                return None

            # Parse URL
            parsed_url = urlparse(url)

            # If no scheme is provided, add one to make urlparse work
            if not parsed_url.netloc:
                parsed_url = urlparse(f"http://{url}")

            domain = parsed_url.netloc

            # Remove port if present
            if ':' in domain:
                domain = domain.split(':')[0]

            # Validate domain
            if domain and '.' in domain:
                return domain

            return None

        except Exception:
            return None

    def get_base_domain(self, url):
        """
        Get the base domain of a URL

        Args:
            url (str): URL to extract base domain from

        Returns:
            str: Base domain
        """
        parsed_url = urlparse(url)
        return parsed_url.netloc

    def extract_domains_from_text(self, text):
        """
        Extract domain names from text using regex

        Args:
            text (str): Text to extract domains from

        Returns:
            set: Set of domain names
        """
        domains = set()

        # Find all matches
        matches = self.domain_pattern.findall(text)

        for match in matches:
            # Filter out common false positives
            if self.is_valid_domain(match):
                domains.add(match)

        return domains

    def is_valid_domain(self, domain):
        """
        Check if a domain is valid

        Args:
            domain (str): Domain to check

        Returns:
            bool: True if valid, False otherwise
        """
        # Filter out common false positives
        invalid_patterns = [
            r'\d+\.\d+\.\d+\.\d+',  # IP addresses
            r'^\d+\.\d+$',          # Version numbers
            r'^\w+\.\w+$'           # Simple two-part strings that might not be domains
        ]

        for pattern in invalid_patterns:
            if re.match(pattern, domain):
                return False

        # Check TLD validity (simplified)
        tld = domain.split('.')[-1]
        if len(tld) < 2 or tld.isdigit():
            return False

        return True

class IPResolver:
    def __init__(self):
        self.resolver = dns.resolver.Resolver()
        # Use Google's DNS servers for reliability
        self.resolver.nameservers = ['8.8.8.8', '8.8.4.4']

    def resolve_ips(self, domain):
        """
        Resolve all IP addresses for a domain

        Args:
            domain (str): Domain name to resolve

        Returns:
            dict: Dictionary with 'ipv4' and 'ipv6' lists
        """
        result = {
            'ipv4': [],
            'ipv6': []
        }

        try:
            # Resolve IPv4 addresses
            try:
                answers = self.resolver.resolve(domain, 'A')
                for rdata in answers:
                    result['ipv4'].append(str(rdata))
            except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.resolver.NoNameservers):
                pass

            # Resolve IPv6 addresses
            try:
                answers = self.resolver.resolve(domain, 'AAAA')
                for rdata in answers:
                    result['ipv6'].append(str(rdata))
            except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.resolver.NoNameservers):
                pass

            # Fallback to socket if DNS resolver fails
            if not result['ipv4'] and not result['ipv6']:
                try:
                    for info in socket.getaddrinfo(domain, None):
                        ip = info[4][0]
                        if ':' in ip:  # IPv6
                            if ip not in result['ipv6']:
                                result['ipv6'].append(ip)
                        else:  # IPv4
                            if ip not in result['ipv4']:
                                result['ipv4'].append(ip)
                except socket.gaierror:
                    pass

            return result

        except Exception as e:
            print(f"Error resolving IPs for domain {domain}: {e}")
            return result

class TrancoChecker:
    def __init__(self, cache_dir='/tmp'):
        self.tranco_url = "https://tranco-list.eu/download/QMNKW/full"
        self.cache_file = os.path.join(cache_dir, 'tranco_list.csv')
        self.tranco_dict = {}
        self.load_tranco_list()

    def load_tranco_list(self):
        """
        Load the Tranco list from cache or download it
        """
        try:
            # Check if cache file exists and is recent
            if os.path.exists(self.cache_file):
                print(f"Loading Tranco list from cache: {self.cache_file}")
                self._load_from_cache()
            else:
                print("Downloading Tranco list...")
                self._download_tranco_list()

        except Exception as e:
            print(f"Error loading Tranco list: {e}")
            # Initialize with empty dictionary if loading fails
            self.tranco_dict = {}

    def _download_tranco_list(self):
        """
        Download the Tranco list and save to cache
        """
        try:
            response = requests.get(self.tranco_url, stream=True)
            response.raise_for_status()

            # Save to cache file
            with open(self.cache_file, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            # Load the downloaded file
            self._load_from_cache()
        except Exception as e:
            print(f"Error downloading Tranco list: {e}")
            # Create a mock Tranco list with some popular domains for testing
            self.tranco_dict = {
                "google.com": 1,
                "youtube.com": 2,
                "facebook.com": 3,
                "twitter.com": 4,
                "instagram.com": 5,
                "linkedin.com": 6,
                "microsoft.com": 7,
                "apple.com": 8,
                "amazon.com": 9,
                "netflix.com": 10
            }
            print("Using mock Tranco list for testing")

    def _load_from_cache(self):
        """
        Load the Tranco list from cache file
        """
        try:
            # Read the CSV file
            df = pd.read_csv(self.cache_file, header=None, names=['rank', 'domain'])

            # Convert to dictionary for faster lookups
            self.tranco_dict = dict(zip(df['domain'], df['rank']))

            print(f"Loaded {len(self.tranco_dict)} domains from Tranco list")
        except Exception as e:
            print(f"Error loading from cache: {e}")
            # Create a mock Tranco list with some popular domains for testing
            self.tranco_dict = {
                "google.com": 1,
                "youtube.com": 2,
                "facebook.com": 3,
                "twitter.com": 4,
                "instagram.com": 5,
                "linkedin.com": 6,
                "microsoft.com": 7,
                "apple.com": 8,
                "amazon.com": 9,
                "netflix.com": 10
            }
            print("Using mock Tranco list for testing")

    def get_rank(self, domain):
        """
        Get the Tranco rank for a domain

        Args:
            domain (str): Domain to check

        Returns:
            int: Tranco rank or None if not in the list
        """
        # Try exact match first
        if domain in self.tranco_dict:
            return self.tranco_dict[domain]

        # Try with 'www.' prefix removed
        if domain.startswith('www.'):
            base_domain = domain[4:]
            if base_domain in self.tranco_dict:
                return self.tranco_dict[base_domain]

        # Try with 'www.' prefix added
        www_domain = f"www.{domain}"
        if www_domain in self.tranco_dict:
            return self.tranco_dict[www_domain]

        return None

class HTTPChecker:
    def __init__(self, timeout=5):
        self.timeout = timeout
        self.user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'

    def check_http_service(self, domain):
        """
        Check if a domain hosts HTTP/HTTPS services and retrieve metadata

        Args:
            domain (str): Domain to check

        Returns:
            dict: HTTP service metadata or None if no service
        """
        result = {
            'has_http_service': False,
            'http_headers': {},
            'page_title': None
        }

        # Try HTTPS first
        https_result = self._check_url(f"https://{domain}")
        if https_result['has_http_service']:
            return https_result

        # Try HTTP if HTTPS failed
        http_result = self._check_url(f"http://{domain}")
        if http_result['has_http_service']:
            return http_result

        # Try with www prefix if both failed
        if not domain.startswith('www.'):
            https_www_result = self._check_url(f"https://www.{domain}")
            if https_www_result['has_http_service']:
                return https_www_result

            http_www_result = self._check_url(f"http://www.{domain}")
            if http_www_result['has_http_service']:
                return http_www_result

        return result

    def _check_url(self, url):
        """
        Check a specific URL for HTTP service

        Args:
            url (str): URL to check

        Returns:
            dict: HTTP service metadata
        """
        result = {
            'has_http_service': False,
            'http_headers': {},
            'page_title': None
        }

        try:
            # Make a HEAD request first to check if service exists
            head_response = requests.head(
                url,
                timeout=self.timeout,
                allow_redirects=True,
                headers={'User-Agent': self.user_agent}
            )

            # If HEAD request succeeds, make a GET request to get the page title
            if head_response.status_code < 400:
                result['has_http_service'] = True

                # Convert headers to dict (they're case-insensitive)
                result['http_headers'] = dict(head_response.headers)

                # Make a GET request to get the page title
                try:
                    get_response = requests.get(
                        url,
                        timeout=self.timeout,
                        headers={'User-Agent': self.user_agent}
                    )

                    if get_response.status_code < 400:
                        # Parse HTML to get the title
                        soup = BeautifulSoup(get_response.text, 'html.parser')
                        title_tag = soup.find('title')
                        if title_tag:
                            result['page_title'] = title_tag.string.strip()
                except Exception:
                    # If GET request fails, we still have the headers from HEAD
                    pass

        except requests.RequestException:
            # Request failed, no HTTP service
            pass

        return result

class DomainAnalyzer:
    def __init__(self):
        self.domain_extractor = DomainExtractor()
        self.ip_resolver = IPResolver()
        self.tranco_checker = TrancoChecker()
        self.http_checker = HTTPChecker()

    def extract_domains(self, url):
        """
        Extract domains from a URL

        Args:
            url (str): URL to extract domains from

        Returns:
            set: Set of domain names
        """
        print(f"Extracting domains from {url}...")
        domains = self.domain_extractor.extract_from_url(url)
        print(f"Extracted {len(domains)} domains from {url}")
        return domains

    def analyze_domain(self, domain):
        """
        Analyze a single domain

        Args:
            domain (str): Domain to analyze

        Returns:
            dict: Domain metadata
        """
        # Initialize domain data
        domain_data = {
            'domain_name': domain,
            'ip_addresses': {},
            'tranco_rank': None,
            'has_http_service': False,
            'http_headers': {},
            'page_title': None,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }

        # Resolve IP addresses
        ip_result = self.ip_resolver.resolve_ips(domain)
        domain_data['ip_addresses'] = ip_result

        # Check Tranco rank
        tranco_rank = self.tranco_checker.get_rank(domain)
        domain_data['tranco_rank'] = tranco_rank

        # Check HTTP service
        http_result = self.http_checker.check_http_service(domain)
        domain_data.update(http_result)

        return domain_data

    def analyze_domains(self, domains):
        """
        Analyze multiple domains

        Args:
            domains (list): List of domains to analyze

        Returns:
            list: List of domain metadata dictionaries
        """
        results = []

        print(f"Analyzing {len(domains)} domains...")
        for domain in domains:
            try:
                # Analyze domain
                domain_data = self.analyze_domain(domain)
                results.append(domain_data)

                # Small delay to avoid overwhelming services
                time.sleep(0.1)

            except Exception as e:
                print(f"Error analyzing domain {domain}: {e}")

        return results

    def analyze_url(self, url):
        """
        Extract domains from a URL and analyze them

        Args:
            url (str): URL to extract domains from

        Returns:
            list: List of domain metadata dictionaries
        """
        # Extract domains
        domains = self.extract_domains(url)

        # Analyze domains
        results = self.analyze_domains(domains)

        print(f"Analysis completed. Analyzed {len(results)} domains.")
        return results

# Initialize domain analyzer
domain_analyzer = DomainAnalyzer()

# Database operations
def save_domain_metadata(domain_data):
    """
    Save domain metadata to the database

    Args:
        domain_data (dict): Dictionary containing domain metadata
    """
    db = SessionLocal()
    try:
        # Check if domain exists
        domain = db.query(Domain).filter(Domain.domain_name == domain_data['domain_name']).first()

        if domain:
            # Update existing domain
            domain.ip_addresses = domain_data['ip_addresses']
            domain.tranco_rank = domain_data['tranco_rank']
            domain.has_http_service = domain_data['has_http_service']
            domain.http_headers = domain_data['http_headers']
            domain.page_title = domain_data['page_title']
            domain.updated_at = datetime.utcnow()
        else:
            # Create new domain
            domain = Domain(
                domain_name=domain_data['domain_name'],
                ip_addresses=domain_data['ip_addresses'],
                tranco_rank=domain_data['tranco_rank'],
                has_http_service=domain_data['has_http_service'],
                http_headers=domain_data['http_headers'],
                page_title=domain_data['page_title']
            )
            db.add(domain)

        db.commit()
        return domain.domain_name
    except Exception as e:
        db.rollback()
        print(f"Error saving domain metadata: {e}")
        raise
    finally:
        db.close()

def get_all_domains(skip: int = 0, limit: int = 100, sort_by: str = "domain_name", sort_order: str = "asc"):
    """
    Get domains from the database with pagination and sorting

    Args:
        skip (int): Number of records to skip (for pagination)
        limit (int): Maximum number of records to return
        sort_by (str): Field to sort by
        sort_order (str): Sort order (asc or desc)

    Returns:
        tuple: (domains, total_count)
    """
    db = SessionLocal()
    try:
        # Build the query with sorting
        query = db.query(Domain)

        # Apply sorting
        if hasattr(Domain, sort_by):
            if sort_order.lower() == "desc":
                query = query.order_by(getattr(Domain, sort_by).desc())
            else:
                query = query.order_by(getattr(Domain, sort_by))
        else:
            # Default sort by domain_name if invalid field
            query = query.order_by(Domain.domain_name)

        # Get total count for pagination
        total_count = query.count()

        # Apply pagination
        domains = query.offset(skip).limit(limit).all()

        return domains, total_count
    finally:
        db.close()

def get_domain(domain_name):
    """
    Get a domain from the database

    Args:
        domain_name (str): Domain name to get

    Returns:
        Domain: Domain object or None if not found
    """
    db = SessionLocal()
    try:
        domain = db.query(Domain).filter(Domain.domain_name == domain_name).first()
        return domain
    finally:
        db.close()



# API endpoints
@app.get("/", response_model=MessageResponse)
def read_root():
    return MessageResponse(message="Domain Analyzer API")

@app.get("/scrape-url", response_model=List[DomainResponse])
def scrape_url(url: str):
    """
    Scrape all domains from a URL, process them, and store in the database
    """
    # Extract domains from the URL
    domain_extractor = DomainExtractor()
    domains = domain_extractor.extract_from_url(url)

    if not domains:
        raise HTTPException(status_code=404, detail="No domains found at the provided URL")

    # Process each domain
    analyzer = DomainAnalyzer()
    results = analyzer.analyze_domains(domains)

    # Save results to database
    for result in results:
        save_domain_metadata(result)

    return results

@app.get("/domains", response_model=PaginatedDomainsResponse)
def get_domains(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Number of items per page"),
    sort_by: str = Query("updated_at", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order (asc or desc)")
):
    """
    Get domains from the database with pagination and sorting
    """
    # Calculate skip for pagination
    skip = (page - 1) * page_size

    # Get domains with pagination
    domains, total_count = get_all_domains(skip, page_size, sort_by, sort_order)

    # Calculate total pages
    total_pages = ceil(total_count / page_size) if total_count > 0 else 1

    # Return paginated response
    return {
        "items": domains,
        "total": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }

# Run the application
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
